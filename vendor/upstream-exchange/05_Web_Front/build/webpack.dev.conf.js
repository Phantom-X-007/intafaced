'use strict'
const webpack = require('webpack')
const config = require('../config')
const { merge } = require('webpack-merge')
const baseWebpackConfig = require('./webpack.base.conf')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const utils = require('./utils')

const proxy = Object.keys(config.dev.proxyTable).map(context => Object.assign(
  { context: [context] },
  config.dev.proxyTable[context]
))

module.exports = merge(baseWebpackConfig, {
  mode: 'development',
  module: {
    rules: utils.styleLoaders({ sourceMap: config.dev.cssSourceMap, usePostCSS: true })
  },
  devtool: config.dev.devtool,
  devServer: {
    historyApiFallback: true,
    hot: true,
    compress: true,
    host: process.env.HOST || config.dev.host,
    port: process.env.PORT ? Number(process.env.PORT) : config.dev.port,
    open: config.dev.autoOpenBrowser,
    client: {
      logging: 'warn',
      overlay: config.dev.errorOverlay
        ? { warnings: false, errors: true, runtimeErrors: true }
        : false
    },
    proxy,
    watchFiles: config.dev.poll
      ? { paths: ['src/**/*', 'index.html'], options: { usePolling: true, interval: config.dev.poll } }
      : ['src/**/*', 'index.html']
  },
  plugins: [
    new webpack.DefinePlugin({ 'process.env': require('../config/dev.env') }),
    // index.html carries remaining-SOT §12.5 CSP Report-Only. Report-only does
    // not block webpack `eval-source-map` / HMR. If this later becomes
    // enforcing, add `'unsafe-eval'` HERE only — never on the production template.
    new HtmlWebpackPlugin({ filename: 'index.html', template: 'index.html', inject: true })
  ]
})
