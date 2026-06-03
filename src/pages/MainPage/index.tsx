/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 主页面组件：应用的主入口页面，集成所有子组件
 * =============================================================
 *
 * 【泛化描述】MainPage 是主页面组件，集成页面各个部分：
 *   - Header（顶部导航栏）
 *   - MainArea（主内容区，Room 或 Antechamber）
 *   - Menu（右侧设置面板）
 *
 *   同时负责页面加载时的初始化：
 *   - 调用 getScenes 获取场景配置
 *   - 监听页面可见性变化（切换标签页时自动离开）
 *
 * 【典型场景】
 *   - 用户打开页面 → MainPage 挂载 → 调用 getScenes → 获取场景配置
 *   - 用户切换到其他标签页 → 离开房间（如果开启了离开检测）
 */

'use strict';

import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import Header from '@/components/Header';
import ResizeWrapper from '@/components/ResizeWrapper';
import Menu from './Menu';
import { useIsMobile } from '@/utils/utils';
import Apis from '@/app/index';
import MainArea from './MainArea';
import { ABORT_VISIBILITY_CHANGE, useLeave } from '@/lib/useCommon';
import {
    RTCConfig,
    SceneConfig,
    updateRTCConfig,
    updateScene,
    updateSceneConfig,
} from '@/store/slices/room';
import styles from './index.module.less';

/**
 * 【组件含义】主页面组件
 *
 * 【职责】
 *   1. 初始化：调用 getScenes 获取所有场景配置
 *   2. 布局：Header + MainArea + Menu
 *   3. 离开检测：页面不可见时自动离开（可选）
 */
export default function () {
    const leaveRoom = useLeave();          // 离开房间的方法
    const dispatch = useDispatch();         // Redux dispatch


    // ----------
    // 第1步：获取场景配置
    // ----------
    /**
     * 获取所有场景配置
     *
     * 【泛化描述】页面加载时调用后端 getScenes 接口，获取所有场景的信息，
     *            然后分别存到 Redux 的 sceneConfigMap、rtcConfigMap 中。
     *
     * 【Redux 更新流程】
     *   1. updateScene('Custom')        → 设置当前选中的场景
     *   2. updateSceneConfig({...})     → 存储所有场景的 UI 配置
     *   3. updateRTCConfig({...})        → 存储所有场景的 RTC 配置（AppId、Token 等）
     */
    const getScenes = async () => {
        // 调用后端 getScenes 接口
        const { scenes }: {
            scenes: {
                rtc: RTCConfig;      // RTC 配置（AppId、RoomId、UserId、Token）
                scene: SceneConfig;   // 场景 UI 配置（名称、图标、功能开关）
            }[];
        } = await Apis.Basic.getScenes();

        // 更新当前选中的场景（默认选第一个）
        dispatch(updateScene(scenes[0].scene.id));

        // 整理场景配置：数组 → 字典，方便按 ID 查找
        dispatch(updateSceneConfig(
            scenes.reduce<Record<string, SceneConfig>>((prev, cur) => {
                prev[cur.scene.id] = cur.scene;
                return prev;
            }, {})
        ));

        // 整理 RTC 配置：数组 → 字典
        dispatch(updateRTCConfig(
            scenes.reduce<Record<string, RTCConfig>>((prev, cur) => {
                prev[cur.scene.id] = cur.rtc;
                return prev;
            }, {})
        ));
    }


    // ----------
    // 第2步：页面可见性变化检测
    // ----------
    useEffect(() => {
        // 页面加载时，获取场景配置
        getScenes();

        // 判断是否为原始 Demo（localhost 环境下不启用自动离开）
        const isOriginalDemo = window.location.host.startsWith('localhost');

        // 监听页面可见性变化（用户切换标签页时触发）
        const handler = () => {
            // document.visibilityState === 'hidden' → 用户切走了
            // 但如果是因为屏幕共享导致的隐藏（sessionStorage 有标记），就不离开
            if (
                document.visibilityState === 'hidden' &&
                !sessionStorage.getItem(ABORT_VISIBILITY_CHANGE)
            ) {
                leaveRoom();  // 自动离开房间
            }
        };

        // 只在非 localhost 环境下启用（避免开发时切换文件也离开房间）
        if (!isOriginalDemo) {
            document.addEventListener('visibilitychange', handler);
        }

        return () => {
            if (!isOriginalDemo) {
                document.removeEventListener('visibilitychange', handler);
            }
        };
    }, []);


    // ----------
    // 第3步：渲染页面布局
    // ----------
    return (
        <ResizeWrapper className={styles.container}>
            {/* 顶部导航栏：Logo、标题、网络状态、法律声明 */}
            <Header />

            {/* 主内容区域 */}
            <div
                className={styles.main}
                style={{
                    padding: useIsMobile() ? '' : '24px',  // 移动端不加内边距
                }}
            >
                {/* 场景内容区（Room 或 Antechamber） */}
                <div className={`${styles.mainArea} ${useIsMobile() ? styles.isMobile : ''}`}>
                    <MainArea />
                </div>

                {/* 右侧设置面板（PC 端显示，移动端隐藏） */}
                {useIsMobile() ? null : (
                    <div className={styles.operationArea}>
                        <Menu />
                    </div>
                )}
            </div>
        </ResizeWrapper>
    );
}
