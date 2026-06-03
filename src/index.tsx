/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * React 入口文件：挂载 React 应用到 DOM
 * =============================================================
 *
 * 【泛化描述】这是前端代码的"起点"。浏览器加载 index.html 后，
 *            找到 <div id="root">，然后 React 把 App.tsx 渲染进去。
 *
 *            同时，在这里做全局初始化：
 *   - Redux Provider（全局状态管理）
 *   - 加载全局样式
 *
 * 【典型场景】
 *   index.html → <div id="root"> → ReactDOM.createRoot → root.render(<App />)
 */

'use strict';

import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';  // Redux Provider，包裹后所有组件都能用 Redux
import App from './App';                  // 根组件
import store from './store';             // Redux Store
import './index.less';                  // 全局样式

/**
 * 【初始化 React】创建 React 18 的 Concurrent Root
 *
 * 【典型场景】
 *   document.getElementById('root') → <div id="root"></div>
 *   ReactDOM.createRoot() → 创建并发模式的 Root
 *   root.render() → 开始渲染
 */
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

/**
 * 【渲染】
 *   <Provider store={store}> → 包裹整个应用，让所有组件能访问 Redux
 *     <App /> → 渲染根组件
 */
root.render(
    <Provider store={store}>
        <App />
    </Provider>
);
