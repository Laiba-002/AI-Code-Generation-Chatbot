module.exports = {
  webpack: {
    configure: (webpackConfig, { env, paths }) => {
      // Fix allowedHosts configuration for development server
      if (env === 'development') {
        // Ensure devServer exists
        if (!webpackConfig.devServer) {
          webpackConfig.devServer = {};
        }
        
        // Set allowedHosts as an array of strings
        webpackConfig.devServer.allowedHosts = ['localhost', '127.0.0.1', '.localhost'];
        webpackConfig.devServer.host = 'localhost';
        webpackConfig.devServer.port = 3000;
        webpackConfig.devServer.headers = {
          'Access-Control-Allow-Origin': '*',
        };
      }
      return webpackConfig;
    },
  },
}; 