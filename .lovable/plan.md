# Apex Learning Classes: student and teaching portal

## Product work
- Add student mobile-number sign-in using the existing account pattern, with manager- and teacher-created student accounts and passwords. Keep password entry private; staff can reset a password but never retrieve an existing one.
- Replace the teacher placeholder with useful staff workflows: manage their students, post homework, and record daily attendance. Managers can oversee teachers and students; students see their own homework, attendance, and class information.
- Add the database tables and row-level access rules needed for student-to-teacher assignment, homework, and attendance. Enforce staff permissions on every write and restrict student reads to their own records.
- Add an in-site live-class and recording experience using the video service selected by the user. Keep provider setup and embeds dependent on that choice.
- Keep the existing mobile sign-in, visual style, Netlify setup, and manager-only teacher controls intact; add route metadata and focused tests for account validation and authorization rules.

## Technical approach
- Extend the existing `app_role` with `student` in a standalone migration, then apply a second additive migration for student assignments, homework, attendance, and access policies. Include Data API grants before RLS and policies for every new public table.
- Use authenticated server functions for creating student accounts and changing passwords. Use the existing signed-in client and RLS for reads/writes; manager access is checked through the existing protected role function, and teachers are limited to assigned students.
- Verify login, staff workflows, and student views end-to-end. Do not claim existing passwords can be viewed or store them in plain text.
