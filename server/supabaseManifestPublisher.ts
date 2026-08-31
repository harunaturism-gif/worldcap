import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PersistenceConfig } from './config.js';
import {
  parsePublicDrawArtifact, serializePublicDrawArtifact,
  type ManifestPublisher, type PublicDrawArtifact,
} from './publicManifest.js';
import { operationalLog } from './structuredLogger.js';

const BUCKET = /^[a-z0-9][a-z0-9._-]{2,62}$/;

function objectPath(drawId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(drawId)) throw new Error('public_artifact_draw_id_invalid');
  return `draws/${drawId}/artifact-v2.json`;
}

export class SupabaseStorageManifestPublisher implements ManifestPublisher {
  constructor(private readonly client: SupabaseClient, private readonly bucket: string) {
    if (!BUCKET.test(bucket)) throw new Error('public_manifest_bucket_invalid');
  }
  async publish(artifact: PublicDrawArtifact) {
    const path = objectPath(artifact.drawId);
    const body = serializePublicDrawArtifact(artifact);
    const { error } = await this.client.storage.from(this.bucket).upload(path, body, { contentType: 'application/json; charset=utf-8', cacheControl: '31536000', upsert: false });
    if (!error) return { uri: `supabase-storage://${this.bucket}/${path}`, replayed: false };
    const existing = await this.get(artifact.drawId);
    if (!existing || existing.artifactContentHash !== artifact.artifactContentHash) throw new Error('published_manifest_immutable');
    return { uri: `supabase-storage://${this.bucket}/${path}`, replayed: true };
  }
  async get(drawId: string) {
    const { data, error } = await this.client.storage.from(this.bucket).download(objectPath(drawId));
    if (error || !data) return null;
    return parsePublicDrawArtifact(JSON.parse(await data.text()));
  }
}

export class SupabaseManifestPublicationWorker {
  constructor(private readonly client: SupabaseClient, private readonly publisher: ManifestPublisher) {}
  async runOnce(limit = 25): Promise<{ processed: number; published: number; failed: number }> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('manifest_publication_limit_invalid');
    const { data, error } = await this.client.from('draw_manifests')
      .select('draw_id,public_manifest,artifact_content_hash')
      .in('publication_status', ['pending', 'failed']).order('generated_at').limit(limit);
    if (error) throw new Error('manifest_publication_claim_failed');
    let published = 0; let failed = 0;
    for (const row of data ?? []) {
      const drawId = row.draw_id as string;
      try {
        const artifact = parsePublicDrawArtifact(row.public_manifest);
        if (artifact.drawId !== drawId || artifact.artifactContentHash !== row.artifact_content_hash) throw new Error('manifest_publication_binding_mismatch');
        const result = await this.publisher.publish(artifact);
        const update = await this.client.from('draw_manifests').update({ publication_status: 'published', publication_uri: result.uri }).eq('draw_id', drawId).eq('artifact_content_hash', artifact.artifactContentHash);
        if (update.error) throw new Error('manifest_publication_status_failed');
        published += 1;
        operationalLog('manifest_publication', { drawId, status: result.replayed ? 'replayed' : 'published' });
      } catch (publicationError) {
        failed += 1;
        await this.client.from('draw_manifests').update({ publication_status: 'failed' }).eq('draw_id', drawId);
        operationalLog('manifest_publication_failure', { drawId, reason: publicationError instanceof Error ? publicationError.message : 'manifest_publication_failed' });
      }
    }
    return { processed: data?.length ?? 0, published, failed };
  }
}

export function createSupabaseManifestPublication(config: PersistenceConfig, bucket: string) {
  if (config.mode !== 'supabase' || !config.supabaseUrl || !config.serviceRoleKey) throw new Error('Invalid Supabase configuration');
  const client = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { 'X-Client-Info': 'worldcap-manifest-publisher' } },
  });
  const publisher = new SupabaseStorageManifestPublisher(client, bucket);
  return { publisher, worker: new SupabaseManifestPublicationWorker(client, publisher) };
}
