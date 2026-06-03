/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 通话按钮组件：点击后进入 RTC 房间，开始 AI 对话
 * =============================================================
 *
 * 【泛化描述】这是入场页的"通话"按钮组件。包含：
 *            - 圆形按钮（带动画效果）
 *            - 按钮图标（电话图标 / 加载动画）
 *            - 按钮文字（"通话" / "连接中"）
 *
 * 【典型场景】
 *   <InvokeButton onClick={handleJoinRoom} loading={isJoining} />
 *   → loading=false: 显示电话图标 + "通话"
 *   → loading=true:  显示加载动画 + "连接中"
 */

'use strict';

import Loading from './loading';
import style from './index.module.less';
import CallButtonSVG from '@/assets/img/CallWrapper.svg';
import PhoneSVG from '@/assets/img/Phone.svg';

/**
 * 【接口含义】通话按钮的 Props 定义
 *
 * 【字段具体含义】
 *   loading : boolean - 是否正在连接（true=显示加载动画，false=显示电话图标）
 *   className : string - 自定义样式类名
 *   ...rest : 其他继承的 HTML 属性（如 onClick、disabled 等）
 */
interface IInvokeButtonProps extends React.HTMLAttributes<HTMLDivElement> {
    loading?: boolean;
}

/**
 * 【组件含义】通话按钮
 *
 * @param props.loading - 是否正在连接（影响按钮显示内容）
 */
function InvokeButton(props: IInvokeButtonProps) {
    const { loading, className, ...rest } = props;

    return (
        <div
            className={`${style.wrapper} ${loading ? '' : style.cursor} ${className}`}
            {...rest}
        >
            <div className={style.btn}>
                <img src={CallButtonSVG} alt="call" />
                {loading ? (
                    // 【正在连接】显示加载动画
                    <Loading className={style.icon} />
                ) : (
                    // 【未连接】显示电话图标
                    <img src={PhoneSVG} className={style.icon} alt="phone" />
                )}
            </div>
            {/* 按钮文字：loading=true → "连接中"，loading=false → "通话" */}
            <div className={style.text}>{loading ? '连接中' : '通话'}</div>
        </div>
    );
}

export default InvokeButton;
