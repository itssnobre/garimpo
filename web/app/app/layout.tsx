import Sidebar from "@/components/Sidebar";
import { ContaProvider } from "@/lib/conta";
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (<ContaProvider><div className="app-shell"><Sidebar /><main className="app-main"><div className="app-in">{children}</div></main></div></ContaProvider>);
}
