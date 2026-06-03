/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 *
 * =============================================================
 * 设备设置按钮组件：弹出设备选择抽屉（切换麦克风/摄像头）
 * =============================================================
 *
 * 【泛化描述】DeviceDrawerButton = 设备设置按钮。
 *            点击后弹出抽屉，包含：
 *            - 设备开关（开启/关闭）
 *            - 设备选择下拉框（切换到哪个麦克风/摄像头）
 */

'use strict';

import { useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { MediaType } from '@volcengine/rtc';
import { Switch, Select } from '@arco-design/web-react';
import DrawerRowItem from '@/components/DrawerRowItem';
import { RootState } from '@/store';
import RtcClient from '@/lib/RtcClient';
import { useDeviceState, useScene } from '@/lib/useCommon';
import { updateSelectedDevice } from '@/store/slices/device';
import { isMobile } from '@/utils/utils';
import styles from './index.module.less';

interface IDeviceDrawerButtonProps {
    type?: MediaType.AUDIO | MediaType.VIDEO;
}

const DEVICE_NAME = {
    [MediaType.AUDIO]: '麦克风',
    [MediaType.VIDEO]: '摄像头',
};

function DeviceDrawerButton(props: IDeviceDrawerButtonProps) {
    const { type = MediaType.AUDIO } = props;
    const device = useDeviceState();
    const isEnable = type === MediaType.AUDIO ? device.isAudioPublished : device.isVideoPublished;
    const switcher = type === MediaType.AUDIO ? device.switchMic : device.switchCamera;
    const devicePermissions = useSelector((state: RootState) => state.device.devicePermissions);
    const devices = useSelector((state: RootState) => state.device);
    const selectedDevice =
        type === MediaType.AUDIO ? devices.selectedMicrophone : devices.selectedCamera;
    const permission = devicePermissions?.[type === MediaType.AUDIO ? 'audio' : 'video'];
    const { isScreenMode } = useScene();
    const isScreenEnable = device.isScreenPublished;
    const changeScreenPublished = device.switchScreenCapture;

    const SETTING_NAME = {
        [MediaType.AUDIO]: '麦克风',
        [MediaType.VIDEO]: isScreenMode ? '屏幕共享' : '视频',
    };

    const dispatch = useDispatch();
    const deviceList = useMemo(
        () => (type === MediaType.AUDIO ? devices.audioInputs : devices.videoInputs),
        [devices]
    );

    const handleDeviceChange = (value: string) => {
        RtcClient.switchDevice(type, value);
        if (type === MediaType.AUDIO) {
            dispatch(updateSelectedDevice({ selectedMicrophone: value }));
        }
        if (type === MediaType.VIDEO) {
            dispatch(updateSelectedDevice({ selectedCamera: value }));
        }
    };

    return (
        <DrawerRowItem
            btnText={`${SETTING_NAME[type]}设置`}
            drawer={{
                width: isMobile() ? '100%' : undefined,
                title: `${SETTING_NAME[type]}设置`,
                footer: null,
                children: (
                    <>
                        {!isScreenMode && (
                            <div className={styles.wrapper}>
                                <div className={styles.label}>{DEVICE_NAME[type]}</div>
                                <div className={styles.value}>
                                    <Switch
                                        checked={isEnable}
                                        size="small"
                                        onChange={(enable) => switcher(enable)}
                                        disabled={!permission}
                                    />
                                    <Select
                                        style={{ width: 250 }}
                                        value={selectedDevice}
                                        onChange={handleDeviceChange}
                                    >
                                        {deviceList.map((device) => (
                                            <Select.Option key={device.deviceId} value={device.deviceId}>
                                                {device.label}
                                            </Select.Option>
                                        ))}
                                    </Select>
                                </div>
                            </div>
                        )}
                        {type === MediaType.VIDEO && isScreenMode && (
                            <div className={styles.wrapper}>
                                <div className={styles.label}>屏幕共享</div>
                                <div className={styles.value}>
                                    <Switch checked={isScreenEnable} size="small" onChange={changeScreenPublished} />
                                </div>
                            </div>
                        )}
                    </>
                ),
            }}
        />
    );
}

export default DeviceDrawerButton;
