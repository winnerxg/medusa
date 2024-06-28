import numberSidebarItems from "./utils/number-sidebar-items.mjs"
import { sidebarAttachHrefCommonOptions } from "./utils/sidebar-attach-common-options.mjs"

/** @type {import('@/types').SidebarItemType[]} */
export const sidebar = sidebarAttachHrefCommonOptions(
  numberSidebarItems([
    {
      path: "/",
      title: "Introduction",
    },
    {
      path: "/first-customizations",
      title: "Your First Customizations",
    },
    {
      path: "/basics",
      title: "The Basics",
      children: [
        {
          path: "/basics/important-directories-files",
          title: "Important Directories and Files",
        },
        {
          path: "/basics/medusa-container",
          title: "Medusa Container",
        },
        {
          path: "/basics/api-routes",
          title: "API Routes",
        },
        {
          path: "/basics/modules-and-services",
          title: "Modules and Services",
        },
        {
          path: "/basics/commerce-modules",
          title: "Commerce Modules",
        },
        {
          path: "/basics/modules-directory-structure",
          title: "Modules Directory Structure",
        },
        {
          path: "/basics/data-models",
          title: "Data Models",
        },
        {
          path: "/basics/loaders",
          title: "Loaders",
        },
        {
          path: "/basics/events-and-subscribers",
          title: "Events and Subscribers",
        },
        {
          path: "/basics/scheduled-jobs",
          title: "Scheduled Jobs",
        },
        {
          path: "/basics/workflows",
          title: "Workflows",
        },
        {
          path: "/basics/admin-customizations",
          title: "Admin Customizations",
        },
      ],
    },
    {
      path: "/advanced-development",
      title: "Advanced Development",
      children: [
        {
          title: "API Routes",
          children: [
            {
              path: "/advanced-development/api-routes/http-methods",
              title: "HTTP Methods",
            },
            {
              path: "/advanced-development/api-routes/parameters",
              title: "Parameters",
            },
            {
              path: "/advanced-development/api-routes/middlewares",
              title: "Middlewares",
            },
            {
              path: "/advanced-development/api-routes/cors",
              title: "Handling CORS",
            },
            {
              path: "/advanced-development/api-routes/protected-routes",
              title: "Protected Routes",
            },
          ],
        },
        {
          title: "Modules",
          children: [
            {
              path: "/advanced-development/modules/container",
              title: "Module's Container",
            },
            {
              path: "/advanced-development/modules/service-factory",
              title: "Service Factory",
            },
            {
              path: "/advanced-development/modules/options",
              title: "Module Options",
            },
            {
              path: "/advanced-development/modules/remote-query",
              title: "Remote Query",
            },
            {
              path: "/advanced-development/modules/link-modules",
              title: "Link Modules",
            },
            {
              path: "/advanced-development/modules/remote-link",
              title: "Remote Link",
            },
          ],
        },
        {
          title: "Data Models",
          children: [
            {
              path: "/advanced-development/data-models/property-types",
              title: "Property Types",
            },
            {
              path: "/advanced-development/data-models/configure-properties",
              title: "Configure Properties",
            },
            {
              path: "/advanced-development/data-models/primary-key",
              title: "Primary Key",
            },
            {
              path: "/advanced-development/data-models/relationships",
              title: "Relationships",
            },
            {
              path: "/advanced-development/data-models/relationship-cascades",
              title: "Relationship Cascades",
            },
            {
              path: "/advanced-development/data-models/indexes",
              title: "Data Model Index",
            },
            {
              path: "/advanced-development/data-models/soft-deletable",
              title: "Soft-Deletable Models",
            },
            {
              path: "/advanced-development/data-models/searchable-property",
              title: "Searchable Property",
            },
          ],
        },
        {
          title: "Loaders",
          children: [
            {
              path: "/advanced-development/loaders/outside-modules",
              title: "Create Outside Module",
            },
          ],
        },
        {
          title: "Events and Subscribers",
          children: [
            {
              path: "/advanced-development/events-and-subscribers/data-payload",
              title: "Events Data Payload",
            },
          ],
        },
        {
          title: "Workflows",
          children: [
            {
              path: "/advanced-development/workflows/constructor-constraints",
              title: "Constructor Constraints",
            },
            {
              path: "/advanced-development/workflows/compensation-function",
              title: "Compensation Function",
            },
            {
              path: "/advanced-development/workflows/access-workflow-errors",
              title: "Access Workflow Errors",
            },
            {
              path: "/advanced-development/workflows/retry-failed-steps",
              title: "Retry Failed Steps",
            },
            {
              path: "/advanced-development/workflows/parallel-steps",
              title: "Run Steps in Parallel",
            },
            {
              path: "/advanced-development/workflows/workflow-timeout",
              title: "Workflow Timeout",
            },
            {
              path: "/advanced-development/workflows/long-running-workflow",
              title: "Long-Running Workflow",
            },
            {
              path: "/advanced-development/workflows/advanced-example",
              title: "Example: Advanced Workflow",
            },
          ],
        },
        {
          path: "/advanced-development/custom-cli-scripts",
          title: "Custom CLI Scripts",
        },
        {
          path: "/advanced-development/admin",
          title: "Admin Development",
          children: [
            {
              path: "/advanced-development/admin/widgets",
              title: "Admin Widgets",
            },
            {
              path: "/advanced-development/admin/ui-routes",
              title: "Admin UI Routes",
            },
            {
              path: "/advanced-development/admin/tips",
              title: "Tips",
            },
          ],
        },
      ],
    },
    {
      path: "/storefront-development",
      title: "Storefront Development",
      children: [
        {
          path: "/storefront-development/nextjs-starter",
          title: "Next.js Starter",
        },
      ],
    },
    {
      path: "/architectural-concepts/architectural-modules",
      title: "Architectural Modules",
    },
    {
      path: "/debugging-and-testing",
      title: "Debugging and Testing",
      children: [
        {
          path: "/debugging-and-testing/logging",
          title: "Logging",
        },
        {
          path: "/debugging-and-testing/tools",
          title: "Tools",
        },
        {
          path: "/debugging-and-testing/feature-flags",
          title: "Feature Flags",
        },
      ],
    },
    {
      path: "/deployment",
      title: "Deployment",
    },
    {
      path: "/more-resources",
      title: "More Resources",
    },
    {
      path: "/cheatsheet",
      title: "Cheat Sheet",
    },
  ])
)
