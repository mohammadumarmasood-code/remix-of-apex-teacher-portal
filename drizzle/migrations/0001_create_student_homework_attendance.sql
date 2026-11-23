CREATE TABLE public.student_teacher_assignments (
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, teacher_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_teacher_assignments TO authenticated;
GRANT ALL ON public.student_teacher_assignments TO service_role;
ALTER TABLE public.student_teacher_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY student_assignment_read ON public.student_teacher_assignments FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'manager'::public.app_role) OR teacher_id = auth.uid() OR student_id = auth.uid()
);
CREATE POLICY student_assignment_insert ON public.student_teacher_assignments FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'manager'::public.app_role) OR (teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role))
);
CREATE POLICY student_assignment_update ON public.student_teacher_assignments FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'manager'::public.app_role) OR (teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role))
) WITH CHECK (
  public.has_role(auth.uid(), 'manager'::public.app_role) OR (teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role))
);
CREATE POLICY student_assignment_delete ON public.student_teacher_assignments FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'manager'::public.app_role) OR (teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role))
);

CREATE TABLE public.homework (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  subject text,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homework TO authenticated;
GRANT ALL ON public.homework TO service_role;
ALTER TABLE public.homework ENABLE ROW LEVEL SECURITY;
CREATE POLICY homework_read ON public.homework FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  OR (teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role))
  OR (public.has_role(auth.uid(), 'student'::public.app_role) AND EXISTS (
    SELECT 1 FROM public.student_teacher_assignments a WHERE a.student_id = auth.uid() AND a.teacher_id = homework.teacher_id
  ))
);
CREATE POLICY homework_insert ON public.homework FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  OR (teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role))
);
CREATE POLICY homework_update ON public.homework FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  OR (teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role))
) WITH CHECK (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  OR (teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role))
);
CREATE POLICY homework_delete ON public.homework FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  OR (teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role))
);

CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  attendance_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL CHECK (status IN ('present', 'absent', 'late')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, attendance_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY attendance_read ON public.attendance FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  OR student_id = auth.uid()
  OR (teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role))
);
CREATE POLICY attendance_insert ON public.attendance FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  OR (
    teacher_id = auth.uid()
    AND public.has_role(auth.uid(), 'teacher'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.student_teacher_assignments a WHERE a.student_id = attendance.student_id AND a.teacher_id = auth.uid())
  )
);
CREATE POLICY attendance_update ON public.attendance FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  OR (
    teacher_id = auth.uid()
    AND public.has_role(auth.uid(), 'teacher'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.student_teacher_assignments a WHERE a.student_id = attendance.student_id AND a.teacher_id = auth.uid())
  )
) WITH CHECK (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  OR (
    teacher_id = auth.uid()
    AND public.has_role(auth.uid(), 'teacher'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.student_teacher_assignments a WHERE a.student_id = attendance.student_id AND a.teacher_id = auth.uid())
  )
);
CREATE POLICY attendance_delete ON public.attendance FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  OR (
    teacher_id = auth.uid()
    AND public.has_role(auth.uid(), 'teacher'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.student_teacher_assignments a WHERE a.student_id = attendance.student_id AND a.teacher_id = auth.uid())
  )
);
CREATE POLICY assigned_teacher_student_profile_read ON public.profiles FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.student_teacher_assignments a WHERE a.student_id = profiles.id AND a.teacher_id = auth.uid()
  )
);