/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * AI 场景选择卡片组件：展示所有可选的 AI 场景/角色
 * =============================================================
 *
 * 【泛化描述】AIChangeCard = AI Change Card（AI 选择卡片）。
 *            这是入场页的"AI 场景选择区"：
 *            - 显示当前选中的 AI 头像和名称
 *            - 显示所有可选的 AI 场景标签
 *            - 支持点击切换场景
 *
 * 【典型场景】
 *   - 用户打开页面 → 显示当前 AI 头像 + 所有可选场景
 *   - 用户点击某个场景 → 切换到该场景，更新 UI
 */

'use strict';

import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import { useScene } from '@/lib/useCommon';
import { updateScene } from '@/store/slices/room';
import CheckScene from './CheckScene';
import styles from './index.module.less';

function AIChangeCard() {
    const dispatch = useDispatch();
    const { id, icon, name } = useScene();
    const sceneConfigMap = useSelector((state: RootState) => state.room.sceneConfigMap);

    const handleSelectScene = (sceneId: string) => {
        if (sceneId !== id) {
            dispatch(updateScene(sceneId));
        }
    };

    return (
        <div className={styles.card}>
            {/* AI 头像 */}
            <div className={styles.avatar}>
                <img src={icon} alt={name || 'AI Avatar'} />
            </div>

            {/* AI 名称 */}
            <div className={styles.title}>{name}</div>

            {/* AI 描述 */}
            <div className={styles.desc}>支持豆包 Vision 模型和深度思考模型</div>

            {/* 场景选项列表 */}
            <div className={styles.sceneContainer}>
                {Object.values(sceneConfigMap).map((scene) => (
                    <CheckScene
                        key={scene.id}
                        sceneId={scene.id}
                        name={scene.name}
                        icon={scene.icon}
                        isActive={scene.id === id}
                        onClick={() => handleSelectScene(scene.id)}
                    />
                ))}
            </div>
        </div>
    );
}

export default AIChangeCard;
