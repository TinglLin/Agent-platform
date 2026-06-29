import { useEffect, useState } from "react";
import { Empty, message } from "antd";
import { AppCard } from "@/components/common/AppCard";
import { AppLayout } from "@/components/common/AppLayout";
import { addToMyApps, fetchPlaygroundApps, fetchUserApps, removeFromMyApps } from "@/services/workflowApi";
import type { PlaygroundAppItem, UserAppItem } from "@/types/canvas";

export default function PlaygroundPage() {
  const [apps, setApps] = useState<PlaygroundAppItem[]>([]);
  const [myApps, setMyApps] = useState<UserAppItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchPlaygroundApps(), fetchUserApps()])
      .then(([playground, user]) => {
        setApps(playground);
        setMyApps(user);
      })
      .catch((e) => message.error(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  /** 根据「我的应用」判断每个广场卡片的按钮状态 */
  const getButtonState = (app: PlaygroundAppItem): 'add' | 'added' | 'update' => {
    const matched = myApps.find((m) => m.name === app.name);
    if (!matched) return 'add';
    if (matched.current_version === app.current_version) return 'added';
    return 'update';
  };

  const handleAddOrUpdate = async (app: PlaygroundAppItem) => {
    const matched = myApps.find((m) => m.name === app.name);
    if (matched && matched.current_version !== app.current_version) {
      // 更新：删除旧卡片 + 添加新卡片
      try {
        await removeFromMyApps(matched.workflow_id);
        await addToMyApps(app.workflow_id);
        message.success(`已更新「${app.name}」v${app.current_version}`);
        // 刷新列表
        const [playground, user] = await Promise.all([fetchPlaygroundApps(), fetchUserApps()]);
        setApps(playground);
        setMyApps(user);
      } catch (e) {
        message.error(e instanceof Error ? e.message : "更新失败");
      }
    } else {
      // 添加
      try {
        await addToMyApps(app.workflow_id);
        message.success(`已添加「${app.name}」`);
        const user = await fetchUserApps();
        setMyApps(user);
      } catch (e) {
        message.error(e instanceof Error ? e.message : "添加失败");
      }
    }
  };

  return (
    <AppLayout>
      {!loading && apps.length === 0 ? (
        <Empty description="暂无已发布应用，请在编排端发布后返回此处添加" />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
          {apps.map((app) => (
            <AppCard
              key={app.workflow_id}
              app={app}
              loading={loading}
              showAddApp={getButtonState(app)}
              onAddApp={() => handleAddOrUpdate(app)}
            />
          ))}
        </div>
      )}
    </AppLayout>
  );
}
