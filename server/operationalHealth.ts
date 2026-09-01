import express from 'express';

export interface ReadinessState {
  runtime: string;
  configurationValid: boolean;
  persistenceConfigured: boolean;
  providerConfigurationMissing: readonly string[];
  probePersistence(): Promise<boolean>;
}

export function createOperationalRouter(state: ReadinessState) {
  const router = express.Router();
  router.get('/health', (_request, response) => response.json({ ok: true, status: 'alive', runtime: state.runtime }));
  router.get('/ready', async (_request, response) => {
    const persistenceReachable = state.persistenceConfigured ? await state.probePersistence().catch(() => false) : false;
    const ready = state.configurationValid && persistenceReachable && state.providerConfigurationMissing.length === 0;
    return response.status(ready ? 200 : 503).json({ ready, runtime: state.runtime, checks: { configurationValid: state.configurationValid, persistenceReachable, requiredProvidersConfigured: state.providerConfigurationMissing.length === 0 }, missingConfiguration: state.providerConfigurationMissing });
  });
  return router;
}
