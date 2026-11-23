# Apex Learning Classes staff management

## Goal
Expand the existing manager/teacher portal so staff can manage student records, homework, attendance, and live-class details, with a separate student sign-in area for assigned class content.

## Scope
- Add and maintain student records; managers can view and assign students across teachers, while teachers manage their own assigned students.
- Create student accounts from staff tools; keep public signup off and retain mobile-number/password sign-in.
- Let students see homework for their class, their own attendance, and live-class details/recordings for their class.
- Create homework with subject, class/group, instructions, due date, and optional resource link.
- Record attendance by date and student, with present, absent, or late statuses; students can view their own records.
- Schedule live classes with a meeting link and add a recording link afterward; show those details to students in their area.
- Preserve the existing phone-number sign-in, manager controls, teacher account management, and password reset.

## Assumptions and limits
- Managers and teachers can create student accounts, using the existing mobile-number/password model; managers can manage all students and teachers manage students assigned to them.
- Live video and recording hosting are external: staff provide meeting/recording URLs. No in-app video streaming, video upload, SMS, or WhatsApp integration is included.
- Students can read only their own profile, attendance, and class-targeted homework/class links; they cannot edit staff records.
- Netlify's current `dist` publishing setting remains unchanged; this work does not connect or deploy to the Netlify account.

## Technical approach
- Add the student role and the tables needed for students, homework, attendance, and scheduled classes through the managed database migration tool, with role-scoped access policies.
- Use authenticated server functions for student-account creation and protected writes; use existing client/RLS patterns for reads and keep manager-only account controls protected.
- Add role-specific dashboard views for managers, teachers, and students, using existing design tokens and UI components.
- Add focused tests for role boundaries, student visibility, and attendance validation, then verify manager, teacher, and student workflows in the preview.
