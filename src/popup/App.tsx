import { Badge, Layout, Tabs, type TabsProps, message } from "antd"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useShallow } from "zustand/shallow"

import {
  AppstoreOutlined,
  ControlOutlined,
  EnvironmentOutlined,
  EyeOutlined,
  GlobalOutlined,
} from '@ant-design/icons';

import FConfig from "./config"
import { useStorageStore } from "./stores/storage";
import { usePrefsStore } from "./stores/prefs";
import MoreView from "./more";
import { NoticePanel } from "./record";
import PoliciesView from "./policies";
import { IpModulePanel } from "./ip";
import PopupHeader from "./layout/header";
import SiteCard from "./layout/site-card";

import { logManager } from '@/utils/log';
import { cn } from "@/utils/style";

const TAB_KEYS = ['record', 'config', 'policies', 'ip', 'more']

function Application() {
  const [t] = useTranslation()
  const [tab, setTab] = useState<chrome.tabs.Tab>()

  const [messageApi, contextHolder] = message.useMessage();

  const { config, loadStorage } = useStorageStore(useShallow((s) => ({
    version: s.version,
    config: s.config,
    loadStorage: s.loadStorage,
  })))

  const { activeKey, setActiveKey } = usePrefsStore(useShallow((s) => ({
    activeKey: s.tab,
    setActiveKey: s.setTab,
  })))

  const isShowConfigBadge = !!config && !config.action.fastInject;

  useEffect(() => {
    loadStorage();
    chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => setTab(tabs[0]))
  }, [])

  useEffect(() => {
    const level = config?.prefs?.logLevel;
    if (level) {
      logManager.setLevel(level);
    }
  }, [config?.prefs?.logLevel])

  const tabItems: TabsProps['items'] = [
    {
      key: 'record',
      icon: <EyeOutlined />,
      label: t('nav.record'),
      children: <NoticePanel tab={tab} />,
    },
    {
      key: 'config',
      icon: <ControlOutlined />,
      label: <Badge dot={isShowConfigBadge} offset={[4, 0]}>{t('nav.config')}</Badge>,
      children: <FConfig />,
    },
    {
      key: 'policies',
      icon: <GlobalOutlined />,
      label: t('nav.policies'),
      children: <PoliciesView msgApi={messageApi} />,
    },
    {
      key: 'ip',
      icon: <EnvironmentOutlined />,
      label: t('nav.ip'),
      children: <IpModulePanel />,
    },
    {
      key: 'more',
      icon: <AppstoreOutlined />,
      label: t('nav.more'),
      children: <MoreView />,
    },
  ]

  return (
    <Layout className="w-80 p-[8px] flex flex-col gap-[8px]">
      {contextHolder}

      <PopupHeader />

      <SiteCard tab={tab} />

      <Tabs
        className={cn(
          "h-[450px] [&>.ant-tabs-nav]:mb-2",
          "[&>.ant-tabs-nav_.ant-tabs-nav-list]:w-full [&>.ant-tabs-nav_.ant-tabs-tab]:flex-1 [&>.ant-tabs-nav_.ant-tabs-tab]:justify-center",
          "[&>.ant-tabs-nav_.ant-tabs-tab-icon]:!me-1",
          "[&_.ant-tabs-tabpane]:animate-fadeIn motion-reduce:[&_.ant-tabs-tabpane]:animate-none",
        )}
        size='small'
        tabBarGutter={0}
        activeKey={TAB_KEYS.includes(activeKey) ? activeKey : TAB_KEYS[0]}
        onChange={setActiveKey}
        items={tabItems} />

    </Layout>
  )
}

export default Application
