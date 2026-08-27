import Sidebar from "@/components/Sidebar";
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (<div className="app-shell"><Sidebar /><main className="app-main"><div className="app-in">{children}</div></main></div>);
}
