import WorkspaceHeader from "@/components/workspace-header";

export default async function Layout({ children }) {

    return (
        <div className="flex h-screen w-full overflow-hidden">
            {/* Sidebar */}
            <WorkspaceHeader/>
            {/* Full-width scroll wrapper */}
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
                {children}
            </div>
        </div>
    );
}
