import React from 'react';
import ReactDOM from 'react-dom/client';
import Root from './root';
import './index.css'; // Add this to preserve global styles if there are any

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
