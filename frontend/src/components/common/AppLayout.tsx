import { Layout, Menu, Typography } from "antd";
import {
  AppstoreOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

const { Header, Content } = Layout;
const { Title } = Typography;

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const selected = location.pathname.startsWith("/my-apps")
    ? "my-apps"
    : location.pathname.startsWith("/canvas")
      ? "canvas"
      : "playground";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          background: "#001529",
          padding: "0 24px",
        }}
      >
        <Title level={4} style={{ color: "#fff", margin: 0, whiteSpace: "nowrap" }}>
          知汇平台用户端
        </Title>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[selected]}
          style={{ flex: 1, minWidth: 0 }}
          items={[
            {
              key: "playground",
              icon: <AppstoreOutlined />,
              label: <Link to="/playground">应用广场</Link>,
            },
            {
              key: "my-apps",
              icon: <UserOutlined />,
              label: <Link to="/my-apps">我的应用</Link>,
            },
          ]}
        />
      </Header>
      <Content style={{ padding: "16px 24px" }}>
        {children}
      </Content>
    </Layout>
  );
}
