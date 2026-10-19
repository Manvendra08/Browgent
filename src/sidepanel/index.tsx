import React from 'react';
import ReactDOM from 'react-dom/client';

export const App: React.FC = () => {
  return (
    <div className="p-4 text-center">
      <h1 className="text-xl font-bold text-indigo-400">Browgent</h1>
      <p className="text-xs text-slate-400 mt-1">Autonomous Native AI Browser Agent</p>
    </div>
  );
};

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
