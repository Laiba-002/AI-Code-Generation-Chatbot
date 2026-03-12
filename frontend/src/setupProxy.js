// const { createProxyMiddleware } = require('http-proxy-middleware');

// module.exports = function(app) {
//   app.use(
//     '/api',
//     createProxyMiddleware({
//       target: 'http://localhost:5000',
//       changeOrigin: true,
//       logLevel: 'debug',
//       timeout: 60000, // 60 seconds timeout
//       proxyTimeout: 60000, // 60 seconds proxy timeout
//       onError: (err, req, res) => {
//         console.error('Proxy error:', err.message);
//         if (!res.headersSent) {
//           res.status(504).json({ error: 'Gateway timeout' });
//         }
//       }
//     })
//   );
// }; 


























const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Proxy all /api requests to Flask backend
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://127.0.0.1:5000', // Use 127.0.0.1 instead of localhost
      changeOrigin: true,
      secure: false,
      timeout: 10000, // 10 second timeout
      proxyTimeout: 10000, // 10 second proxy timeout
      logLevel: 'warn', // Reduce logging noise
      followRedirects: true,
      onProxyReq: (proxyReq, req, res) => {
        console.log(`🔄 Proxying ${req.method} ${req.url} to http://127.0.0.1:5000${req.url}`);
        proxyReq.setHeader('Connection', 'keep-alive');
      },
      onProxyRes: (proxyRes, req, res) => {
        console.log(`✅ Proxy response: ${proxyRes.statusCode} for ${req.method} ${req.url}`);
        // Add CORS headers
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
      },
      onError: (err, req, res) => {
        console.error('❌ Proxy error for', req.url, ':', err.message);
        if (!res.headersSent) {
          res.writeHead(502, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(JSON.stringify({ 
            error: 'Bad Gateway', 
            message: 'Failed to connect to backend server',
            details: err.message,
            url: req.url
          }));
        }
      },
    })
  );

  // Proxy WebSocket connections for SocketIO
  app.use(
    '/socket.io',
    createProxyMiddleware({
      target: 'http://localhost:5000',
      changeOrigin: true,
      ws: true, // Enable WebSocket proxying
      logLevel: 'debug',
    })
  );
};