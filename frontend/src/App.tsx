import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import CanvasPage from "@/pages/Canvas";
import ChatPage from "@/pages/Chat";
import MyAppsPage from "@/pages/MyApps";
import PlaygroundPage from "@/pages/Playground";
import StudioPage from "@/pages/Studio";

export default function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/playground" replace />} />
          <Route path="/playground" element={<PlaygroundPage />} />
          <Route path="/my-apps" element={<MyAppsPage />} />
          <Route path="/canvas" element={<CanvasPage />} />
          <Route path="/canvas/:workflowId" element={<CanvasPage />} />
          <Route path="/studio" element={<StudioPage />} />
          <Route path="/chat/:workflowId" element={<ChatPage />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
