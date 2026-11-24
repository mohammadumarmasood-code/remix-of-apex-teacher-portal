CREATE TABLE public.live_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_classes TO authenticated;
GRANT ALL ON public.live_classes TO service_role;
ALTER TABLE public.live_classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY live_class_read ON public.live_classes FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  OR (teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role))
  OR (public.has_role(auth.uid(), 'student'::public.app_role) AND EXISTS (
    SELECT 1 FROM public.student_teacher_assignments a WHERE a.student_id = auth.uid() AND a.teacher_id = live_classes.teacher_id
  ))
);
CREATE POLICY live_class_insert ON public.live_classes FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  OR (teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role))
);
CREATE POLICY live_class_update ON public.live_classes FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  OR (teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role))
) WITH CHECK (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  OR (teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role))
);
CREATE POLICY live_class_delete ON public.live_classes FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  OR (teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role))
);

CREATE TABLE public.class_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.live_classes(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  signal jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.class_signals TO authenticated;
GRANT ALL ON public.class_signals TO service_role;
ALTER TABLE public.class_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY class_signal_read ON public.class_signals FOR SELECT TO authenticated USING (
  (sender_id = auth.uid() OR recipient_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.live_classes c WHERE c.id = class_signals.class_id AND (
      public.has_role(auth.uid(), 'manager'::public.app_role)
      OR (c.teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role))
      OR (public.has_role(auth.uid(), 'student'::public.app_role) AND EXISTS (
        SELECT 1 FROM public.student_teacher_assignments a WHERE a.student_id = auth.uid() AND a.teacher_id = c.teacher_id
      ))
    )
  )
);
CREATE POLICY class_signal_insert ON public.class_signals FOR INSERT TO authenticated WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.live_classes c WHERE c.id = class_signals.class_id AND (
      public.has_role(auth.uid(), 'manager'::public.app_role)
      OR (c.teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role))
      OR (public.has_role(auth.uid(), 'student'::public.app_role) AND EXISTS (
        SELECT 1 FROM public.student_teacher_assignments a WHERE a.student_id = auth.uid() AND a.teacher_id = c.teacher_id
      ))
    )
  )
  AND EXISTS (
    SELECT 1 FROM public.live_classes c WHERE c.id = class_signals.class_id AND (
      recipient_id = c.teacher_id
      OR (public.has_role(auth.uid(), 'manager'::public.app_role) AND public.has_role(recipient_id, 'teacher'::public.app_role))
      OR EXISTS (SELECT 1 FROM public.student_teacher_assignments a WHERE a.student_id = recipient_id AND a.teacher_id = c.teacher_id)
    )
  )
);
CREATE POLICY class_signal_delete ON public.class_signals FOR DELETE TO authenticated USING (
  (sender_id = auth.uid() OR recipient_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.live_classes c WHERE c.id = class_signals.class_id AND (
      public.has_role(auth.uid(), 'manager'::public.app_role)
      OR c.teacher_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.student_teacher_assignments a WHERE a.student_id = auth.uid() AND a.teacher_id = c.teacher_id)
    )
  )
);
CREATE INDEX class_signals_room_idx ON public.class_signals (class_id, created_at);
CREATE INDEX class_signals_recipient_idx ON public.class_signals (recipient_id, created_at);
ALTER PUBLICATION supabase_realtime ADD TABLE public.class_signals;

CREATE TABLE public.live_class_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.live_classes(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  file_path text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN ('video/webm', 'video/mp4')),
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.live_class_recordings TO authenticated;
GRANT ALL ON public.live_class_recordings TO service_role;
ALTER TABLE public.live_class_recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY class_recording_read ON public.live_class_recordings FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.live_classes c WHERE c.id = live_class_recordings.class_id AND (
      public.has_role(auth.uid(), 'manager'::public.app_role)
      OR (c.teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role))
      OR (public.has_role(auth.uid(), 'student'::public.app_role) AND EXISTS (
        SELECT 1 FROM public.student_teacher_assignments a WHERE a.student_id = auth.uid() AND a.teacher_id = c.teacher_id
      ))
    )
  )
);
CREATE POLICY class_recording_insert ON public.live_class_recordings FOR INSERT TO authenticated WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.live_classes c WHERE c.id = live_class_recordings.class_id AND (
      public.has_role(auth.uid(), 'manager'::public.app_role)
      OR (c.teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role))
    )
  )
);
CREATE POLICY class_recording_delete ON public.live_class_recordings FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  OR (uploaded_by = auth.uid() AND EXISTS (
    SELECT 1 FROM public.live_classes c WHERE c.id = live_class_recordings.class_id AND c.teacher_id = auth.uid()
  ))
);

CREATE POLICY class_recordings_object_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'class-recordings' AND EXISTS (
    SELECT 1 FROM public.live_class_recordings r JOIN public.live_classes c ON c.id = r.class_id
    WHERE r.file_path = storage.objects.name AND (
      public.has_role(auth.uid(), 'manager'::public.app_role)
      OR (c.teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role))
      OR (public.has_role(auth.uid(), 'student'::public.app_role) AND EXISTS (
        SELECT 1 FROM public.student_teacher_assignments a WHERE a.student_id = auth.uid() AND a.teacher_id = c.teacher_id
      ))
    )
  )
);
CREATE POLICY class_recordings_object_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'class-recordings' AND EXISTS (
    SELECT 1 FROM public.live_classes c WHERE c.id::text = (storage.foldername(storage.objects.name))[1] AND (
      public.has_role(auth.uid(), 'manager'::public.app_role)
      OR (c.teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role))
    )
  )
);
CREATE POLICY class_recordings_object_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'class-recordings' AND EXISTS (
    SELECT 1 FROM public.live_classes c WHERE c.id::text = (storage.foldername(storage.objects.name))[1] AND (
      public.has_role(auth.uid(), 'manager'::public.app_role)
      OR (c.teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::public.app_role))
    )
  )
);