/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 顶部导航栏组件：Logo、标题、网络状态指示器、法律声明入口
 * =============================================================
 *
 * 【泛化描述】Header 是页面顶部的导航栏，包含：
 *            - Logo 图片
 *            - 标题文字
 *            - 网络状态指示器（NetworkIndicator）
 *            - 官网链接/联系我们（PC 端）
 *            - 法律声明入口（PC 端弹出菜单）
 */

'use strict';

import { Button, Divider, Popover } from '@arco-design/web-react';
import { IconMenu } from '@arco-design/web-react/icon';
import NetworkIndicator from '@/components/NetworkIndicator';
import { useIsMobile } from '@/utils/utils';
import Logo from '@/assets/img/Logo.svg';
import styles from './index.module.less';

const Disclaimer = 'https://www.volcengine.com/docs/6348/68916';
const ReversoContext = 'https://www.volcengine.com/docs/6348/68918';
const UserAgreement = 'https://www.volcengine.com/docs/6348/128955';

interface HeaderProps {
    children?: React.ReactNode;
    hide?: boolean;
}

function Header(props: HeaderProps) {
    const { children, hide } = props;

    const MenuProps = [
        { name: '免责声明', url: Disclaimer },
        { name: '隐私政策', url: ReversoContext },
        { name: '用户协议', url: UserAgreement },
    ];

    return (
        <div className={styles.header} style={{ display: hide ? 'none' : 'flex' }}>
            <div className={styles['header-logo']}>
                {/* PC 端：法律声明菜单 */}
                {useIsMobile() ? null : (
                    <Popover
                        content={
                            <div className={styles['menu-wrapper']}>
                                {MenuProps.map((menuItem) => (
                                    <Button
                                        type="text"
                                        key={menuItem.name}
                                        onClick={() => window.open(menuItem.url, '_blank')}
                                    >
                                        {menuItem.name}
                                    </Button>
                                ))}
                            </div>
                        }
                    >
                        <IconMenu className={styles['header-setting-btn']} />
                    </Popover>
                )}
                <img src={Logo} alt="Logo" />
                <Divider type="vertical" />
                <span className={styles['header-logo-text']}>实时对话式 AI 体验馆</span>
                <NetworkIndicator />
            </div>
            {children}
            {/* PC 端：官网链接/联系我们 */}
            {useIsMobile() ? null : (
                <div className={styles['header-right']}>
                    <div
                        className={styles['header-right-text']}
                        onClick={() => window.open('https://www.volcengine.com/product/veRTC/ConversationalAI', '_blank')}
                    >
                        官网链接
                    </div>
                    <div
                        className={styles['header-right-text']}
                        onClick={() => window.open('https://www.volcengine.com/contact/product?t=%E5%AF%B9%E8%AF%9D%E5%BC%8Fai&source=%E4%BA%A7%E5%93%81%E5%92%A8%E8%AF%A2', '_blank')}
                    >
                        联系我们
                    </div>
                </div>
            )}
        </div>
    );
}

export default Header;
