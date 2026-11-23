# Hackdeck

An open source, zero-dependency modular JavaScript workspace for hackathon teams to brainstorm ideas, assemble builders, and manage sprint deliverables.

**Live Demo:** [https://hackdeck.js.org](https://hackdeck.js.org)

## Architecture & JavaScript Modules

Hackdeck is built entirely with native ES6+ JavaScript, modular client-side state management, and real-time database synchronization without heavy frontend build steps:

* `js/auth.js`: Handles Google OAuth flows, session persistence, and unique hacker handle onboarding.
* `js/brainstorm.js`: Real-time idea pitch canvas with live upvoting, consensus ranking, and mission statement locking.
* `js/invitations.js`: Username lookup, pending teammate invites, and notification banners.
* `js/board.js` & `js/build.js`: Interactive drag-and-drop milestone Kanban board, submission countdown timers, and project reopening workflows.
* `js/chat.js`: Persistent team messaging with SVG avatar rendering.
* `js/dashboard.js`: Workspace overview, visibility toggles, and board creation.
* `js/config.js`: Supabase client initialization and environment configuration.

## Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/oceanmallik/Hackdeck.git
   cd Hackdeck