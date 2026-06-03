/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 手机端设置抽屉组件：显示房间信息、版本、退出按钮
 * =============================================================
 *
 * 【泛化描述】SettingsDrawer = 设置抽屉。
 *            这是一个从底部滑出的抽屉面板，
 *            包含房间ID、隐私政策、用户协议、免责声明、
 *            版本信息、复制链接、退出房间等功能。
 *
 * 【典型场景】
 *   - 用户点击手机端工具栏的设置图标 → 抽屉从底部滑出
 *   - 用户查看房间ID → 复制链接分享给其他人
 *   - 用户点击"退出房间" → 离开当前房间
 */

import VERTC from '@volcengine/rtc';
import { Drawer, Message } from '@arco-design/web-react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { useLeave } from '@/lib/useCommon';
import { Disclaimer, ReversoContext, UserAgreement } from '@/config';
import { SettingsItem } from '../components/SettingsItem';
import packageJSON from '../../../../package.json';
import styles from './index.module.less';

/**
 * 【字段含义】SettingsDrawerProps
 *
 * @param visible  - 抽屉是否显示（true=显示，false=隐藏）
 * @param onCancel - 关闭抽屉时的回调函数
 *
 * 【典型场景】
 *   visible = true  → 抽屉滑出
 *   visible = false → 抽屉收回
 */
interface SettingsDrawerProps {
    visible: boolean;
    onCancel: () => void;
}

/**
 * 【组件含义】手机端设置抽屉
 *
 * 【职责】
 *   1. 显示当前房间ID（方便用户确认当前房间）
 *   2. 提供隐私政策、用户协议、免责声明的跳转链接
 *   3. 显示 Demo 版本号和 SDK 版本号
 *   4. 提供"复制链接到PC体验"功能
 *   5. 提供"退出房间"功能
 */
function SettingsDrawer({ visible, onCancel }: SettingsDrawerProps) {
    const room = useSelector((state: RootState) => state.room);
    const { roomId } = room;
    const leaveRoom = useLeave();

    /**
     * 点击"退出房间"按钮 → 执行离开房间逻辑
     */
    const handleLogout = () => {
        leaveRoom();
    };

    /**
     * 点击"复制链接"按钮 → 将当前页面URL复制到剪贴板
     *
     * 【步骤】
     *   1. 获取当前页面 URL（不含搜索参数）
     *   2. 调用 navigator.clipboard.writeText 复制到剪贴板
     *   3. 复制成功 → 显示"链接已复制"提示
     *   4. 复制失败 → 显示"复制失败"提示
     *
     * 【典型场景】
     *   用户在手机端体验后 → 点击"复制链接到PC体验" → 链接复制成功 → 在PC端打开同一链接
     */
    const handleCopyLink = () => {
        const pcLink = window.location.origin + window.location.pathname;
        navigator.clipboard
            .writeText(pcLink)
            .then(() => {
                Message.success('链接已复制');
            })
            .catch((err) => {
                console.error('复制链接失败:', err);
                Message.error('复制失败，请手动复制');
            });
    };

    return (
        <Drawer
            title="设置"
            visible={visible}
            onCancel={onCancel}
            footer={null}
            className={styles.settingsDrawer}
            width="100%"
            bodyStyle={{ padding: 0 }}
        >
            {/* 设置页面主体 */}
            <div className={styles.settingsPage}>
                {/* 分组1：房间信息和法律链接 */}
                <div className={styles.settingsGroup}>
                    {/* 房间ID */}
                    <SettingsItem label="房间ID" value={roomId} showArrow={false} />
                    {/* 隐私政策 */}
                    <SettingsItem label="隐私政策" onClick={() => window.open(ReversoContext, '_blank')} />
                    {/* 用户协议 */}
                    <SettingsItem label="用户协议" onClick={() => window.open(UserAgreement, '_blank')} />
                    {/* 免责声明 */}
                    <SettingsItem label="免责声明" onClick={() => window.open(Disclaimer, '_blank')} />
                    {/* 版本信息 */}
                    <SettingsItem
                        label="当前版本"
                        value={
                            <div className={styles.versionInfo}>
                                <span>Demo version {packageJSON.version}</span>
                                <span>SDK version {VERTC.getSdkVersion()}</span>
                            </div>
                        }
                        showArrow={false}
                    />
                </div>

                {/* 分组2：复制链接 */}
                <div className={styles.settingsGroup}>
                    <SettingsItem
                        label="复制链接到 PC 体验"
                        value="复制链接"
                        onClick={handleCopyLink}
                        showArrow={false}
                        valueClassName={styles.copyLinkText}
                    />
                </div>

                {/* 退出房间按钮 */}
                <div className={styles.logoutButtonContainer}>
                    <button className={styles.logoutButton} onClick={handleLogout}>
                        退出房间
                    </button>
                </div>
            </div>
        </Drawer>
    );
}

export default SettingsDrawer;
