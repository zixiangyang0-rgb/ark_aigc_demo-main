/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 应用根组件：配置路由，渲染主页面
 * =============================================================
 *
 * 【泛化描述】App.tsx 是整个前端应用的"入口页面"。
 *            它的职责很简单：
 *   1. 配置路由（BrowserRouter）
 *   2. 引入全局样式（Arco Design CSS）
 *   3. 渲染主页面组件（MainPage）
 *
 * 【典型场景】
 *   - 用户打开页面 → React 渲染 App.tsx → 路由匹配到 / → 渲染 MainPage
 *   - 路由 /xxx → 也渲染 MainPage（因为用了通配符 /*）
 */

'use strict';

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainPage from './pages/MainPage';           // 主页面组件
import '@arco-design/web-react/dist/css/arco.css';  // Arco Design UI 库的全局样式

/**
 * 【组件含义】根组件
 *
 * 【泛化描述】应用的顶层组件，用 BrowserRouter 配置路由。
 *
 * 【路由配置】
 *   /       → MainPage（主页面）
 *   /xxx   → MainPage（通配，所有路径都渲染主页面）
 *
 * 【典型场景】
 *   - 用户访问 http://localhost:3000 → 渲染 MainPage
 *   - 用户访问 http://localhost:3000/abc → 也渲染 MainPage
 */
function App() {
    console.warn('运行问题可参考 README 内容进行排查');
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/">
                    <Route index element={<MainPage />} />
                    {/* 通配符 /* 捕获所有路径，全部渲染 MainPage */}
                    <Route path="/*" element={<MainPage />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

export default App;
