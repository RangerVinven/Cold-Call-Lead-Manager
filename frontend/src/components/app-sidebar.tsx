import * as React from "react"
import { Link } from "react-router-dom"
import {
LayoutDashboard,
Search,
  Calendar,
} from "lucide-react"

import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu, // Keep SidebarMenu
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

// This is sample data.
const data = {
  user: {
    name: "Daniel McPherson",
    email: "daniel.mcpherson@live.co.uk",
    avatar: "/avatars/shadcn.jpg",
  },
}

// Menu items for the standard list of links.
const items = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Search",
    url: "/search",
    icon: Search,
  },
  {
    title: "CRM",
    url: "/crm",
    icon: Calendar,
  }
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <NavUser user={data.user} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              {/* Use Link component instead of <a> tag */}
              <SidebarMenuButton asChild>
                <Link to={item.url}> {/* Use 'to' prop for Link */}
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  )
}
