'use strict';

const path = require('path');
const { merge } = require('webpack-merge');

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

const commonConfig = {
  entry: './src/extension.ts',
  mode: 'none',
  output: {
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode'
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: 'ts-loader'
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
};

const electronConfig = merge(commonConfig, {
  target: 'node',
  output: { filename: 'extension.js' },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log", // enables logging required for problem matchers
  },
});

const browserConfig = merge(commonConfig, {
  target: 'webworker',
  output: { filename: 'web-extension.js' },
  resolve: {
    mainFields: ["module", "main"],
    fallback: {
      assert: false,
      os: false,
      path: require.resolve("path-browserify")
    }
  },
  devtool: 'source-map',
});

module.exports = [electronConfig, browserConfig];