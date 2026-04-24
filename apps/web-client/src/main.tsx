import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { registerServiceWorker } from './registerServiceWorker';
import { createPresentationStoreScenarioAdapter } from './ui/state/presentationStore';

function FatalErrorPanel({ message, diagnostics }: { message: string; diagnostics?: readonly { source: string; field: string; reason: string }[] }) {
  return (
    <div className="fatal-error-panel" role="alert">
      <h1>Scenario initialization failed</h1>
      <p>{message}</p>
      {diagnostics && diagnostics.length > 0 ? (
        <ul>
          {diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.source}-${diagnostic.field}-${index}`}>
              <strong>{diagnostic.source}</strong> — <code>{diagnostic.field}</code>: {diagnostic.reason}
            </li>
          ))}
        </ul>
      ) : (
        <p>No diagnostics were provided.</p>
      )}
    </div>
  );
}

const scenarioAdapter = createPresentationStoreScenarioAdapter();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {scenarioAdapter.scenarioRuntime ? (
      <App scenarioRuntime={scenarioAdapter.scenarioRuntime} />
    ) : (
      <FatalErrorPanel
        message={scenarioAdapter.initializationError?.message ?? 'Unknown initialization error.'}
        diagnostics={scenarioAdapter.initializationError?.diagnostics}
      />
    )}
  </React.StrictMode>
);

registerServiceWorker();
