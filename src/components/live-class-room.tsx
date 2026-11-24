import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, LoaderCircle, LogOut, Mic, MicOff, Radio, Square, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type SignalData = {
  type: "join" | "offer" | "answer" | "candidate" | "leave";
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type SignalRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  signal: SignalData;
};

type RecordingSession = {
  recorder: MediaRecorder;
  chunks: Blob[];
  startedAt: number;
  audioContext: AudioContext;
};

type LiveClassRoomProps = {
  classId: string;
  classTitle: string;
  teacherId: string;
  userId: string;
  isHost: boolean;
  onLeave: () => void;
  onEndClass: () => void;
  onRecordingSaved: () => void;
};

export function LiveClassRoom({
  classId,
  classTitle,
  teacherId,
  userId,
  isHost,
  onLeave,
  onEndClass,
  onRecordingSaved,
}: LiveClassRoomProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const seenSignalsRef = useRef<Set<string>>(new Set());
  const recordingRef = useRef<RecordingSession | null>(null);
  const recordingAudioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recordingAudioStreamsRef = useRef<Set<MediaStream>>(new Set());
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  const sendSignal = useCallback(async (recipientId: string, signal: SignalData) => {
    const { error: insertError } = await supabase.from("class_signals").insert({
      class_id: classId,
      sender_id: userId,
      recipient_id: recipientId,
      signal,
    });
    if (insertError) setError("Could not connect to the classroom. Please rejoin.");
  }, [classId, userId]);

  const connectRecordingAudio = useCallback((stream: MediaStream) => {
    const audioContext = recordingRef.current?.audioContext;
    const destination = recordingAudioDestinationRef.current;
    if (!audioContext || !destination || recordingAudioStreamsRef.current.has(stream)) return;
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) return;
    try {
      const audioOnly = new MediaStream(audioTracks);
      audioContext.createMediaStreamSource(audioOnly).connect(destination);
      recordingAudioStreamsRef.current.add(stream);
    } catch {
      setError("The class audio could not be added to the recording.");
    }
  }, []);

  const createPeer = useCallback((peerId: string) => {
    const existing = peersRef.current.get(peerId);
    if (existing && existing.connectionState !== "closed") return existing;

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    const stream = localStreamRef.current;
    stream?.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.onicecandidate = (event) => {
      if (event.candidate) void sendSignal(peerId, { type: "candidate", candidate: event.candidate.toJSON() });
    };
    peer.ontrack = (event) => {
      const incoming = event.streams[0] ?? new MediaStream([event.track]);
      setRemoteStreams((current) => new Map(current).set(peerId, incoming));
      connectRecordingAudio(incoming);
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "failed") {
        setError("A participant could not connect. Their network may require a relay connection.");
      }
    };
    peersRef.current.set(peerId, peer);
    return peer;
  }, [connectRecordingAudio, sendSignal]);

  const handleSignal = useCallback(async (row: SignalRow) => {
    if (row.recipient_id !== userId || seenSignalsRef.current.has(row.id)) return;
    seenSignalsRef.current.add(row.id);
    const signal = row.signal;

    if (signal.type === "join") {
      if (!isHost) return;
      const peer = createPeer(row.sender_id);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await sendSignal(row.sender_id, { type: "offer", description: offer });
      return;
    }

    if (signal.type === "leave") {
      peersRef.current.get(row.sender_id)?.close();
      peersRef.current.delete(row.sender_id);
      setRemoteStreams((current) => {
        const next = new Map(current);
        next.delete(row.sender_id);
        return next;
      });
      return;
    }

    let peer = peersRef.current.get(row.sender_id);
    if (signal.type === "offer") {
      if (isHost || !signal.description) return;
      peer = createPeer(row.sender_id);
      await peer.setRemoteDescription(new RTCSessionDescription(signal.description));
      const pending = pendingCandidatesRef.current.get(row.sender_id) ?? [];
      for (const candidate of pending) await peer.addIceCandidate(new RTCIceCandidate(candidate));
      pendingCandidatesRef.current.delete(row.sender_id);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await sendSignal(row.sender_id, { type: "answer", description: answer });
      return;
    }

    if (!peer) return;
    if (signal.type === "answer" && signal.description) {
      await peer.setRemoteDescription(new RTCSessionDescription(signal.description));
      const pending = pendingCandidatesRef.current.get(row.sender_id) ?? [];
      for (const candidate of pending) await peer.addIceCandidate(new RTCIceCandidate(candidate));
      pendingCandidatesRef.current.delete(row.sender_id);
    } else if (signal.type === "candidate" && signal.candidate) {
      if (peer.remoteDescription) {
        await peer.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } else {
        const pending = pendingCandidatesRef.current.get(row.sender_id) ?? [];
        pending.push(signal.candidate);
        pendingCandidatesRef.current.set(row.sender_id, pending);
      }
    }
  }, [createPeer, isHost, sendSignal, userId]);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function connect() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera and microphone access is unavailable in this browser.");
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        setCameraEnabled(stream.getVideoTracks().some((track) => track.enabled));
        setMicrophoneEnabled(stream.getAudioTracks().some((track) => track.enabled));
        setStarting(false);

        channel = supabase
          .channel(`class-signals-${classId}-${userId}-${crypto.randomUUID()}`)
          .on("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "class_signals",
            filter: `class_id=eq.${classId}`,
          }, (payload) => {
            void handleSignal(payload.new as SignalRow).catch(() => {
              setError("The live connection was interrupted. Please rejoin.");
            });
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED" && !isHost) {
              void sendSignal(teacherId, { type: "join" });
            }
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              setError("The classroom connection is unavailable. Please try again.");
            }
          });
      } catch (cameraError) {
        setStarting(false);
        setError(cameraError instanceof Error ? cameraError.message : "Allow camera and microphone access to join.");
      }
    }

    void connect();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
      peersRef.current.forEach((peer) => peer.close());
      peersRef.current.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      recordingRef.current?.recorder.stop();
    };
  }, [classId, handleSignal, isHost, sendSignal, teacherId, userId]);

  useEffect(() => {
    if (localStream && localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  const localVideoRef = useRef<HTMLVideoElement>(null);

  async function startRecording() {
    if (!localStreamRef.current) return;
    if (typeof MediaRecorder === "undefined") {
      setError("Recording is not supported by this browser.");
      return;
    }
    try {
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      recordingRef.current = { recorder: undefined as unknown as MediaRecorder, chunks: [], startedAt: Date.now(), audioContext };
      recordingAudioDestinationRef.current = destination;
      recordingAudioStreamsRef.current.clear();
      connectRecordingAudio(localStreamRef.current);
      remoteStreams.forEach((stream) => connectRecordingAudio(stream));
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (!videoTrack) throw new Error("Turn on your camera before recording.");
      const recordingStream = new MediaStream([videoTrack, ...destination.stream.getAudioTracks()]);
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";
      const recorder = new MediaRecorder(recordingStream, { mimeType });
      recordingRef.current = { recorder, chunks: [], startedAt: Date.now(), audioContext };
      recorder.ondataavailable = (event) => {
        if (event.data.size) recordingRef.current?.chunks.push(event.data);
      };
      recorder.onstop = () => {
        void (async () => {
          const session = recordingRef.current;
          if (!session) return;
          const blob = new Blob(session.chunks, { type: "video/webm" });
          const filePath = `${classId}/${userId}-${Date.now()}.webm`;
          const duration = Math.max(1, Math.round((Date.now() - session.startedAt) / 1000));
          const { error: uploadError } = await supabase.storage.from("class-recordings").upload(filePath, blob, {
            contentType: "video/webm",
            upsert: false,
          });
          if (uploadError) {
            setError("The recording could not be saved. Check your connection and try again.");
          } else {
            const { error: rowError } = await supabase.from("live_class_recordings").insert({
              class_id: classId,
              uploaded_by: userId,
              file_path: filePath,
              mime_type: "video/webm",
              duration_seconds: duration,
            });
            if (rowError) {
              setError("The video was uploaded, but its class record could not be saved.");
            } else {
              onRecordingSaved();
            }
          }
          await session.audioContext.close();
          recordingAudioDestinationRef.current = null;
          recordingAudioStreamsRef.current.clear();
          recordingRef.current = null;
          setRecording(false);
        })();
      };
      recorder.start(1000);
      setRecording(true);
      setError(null);
    } catch (recordError) {
      recordingRef.current?.audioContext.close();
      recordingRef.current = null;
      recordingAudioDestinationRef.current = null;
      setRecording(false);
      setError(recordError instanceof Error ? recordError.message : "Could not start recording.");
    }
  }

  function stopRecording() {
    const recorder = recordingRef.current?.recorder;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  function toggleTrack(kind: "audio" | "video") {
    const tracks = kind === "audio" ? localStreamRef.current?.getAudioTracks() : localStreamRef.current?.getVideoTracks();
    if (!tracks?.length) return;
    const enabled = !tracks[0]?.enabled;
    tracks.forEach((track) => { track.enabled = enabled; });
    if (kind === "audio") setMicrophoneEnabled(enabled);
    else setCameraEnabled(enabled);
  }

  function leaveRoom() {
    if (isHost && recording) {
      setError("Stop and save the recording before ending the class.");
      return;
    }
    if (!isHost) void sendSignal(teacherId, { type: "leave" });
    onLeave();
  }

  return (
    <section className="space-y-4 border-t pt-6" aria-label="Live classroom">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <span className="h-2 w-2 rounded-full bg-destructive" /> LIVE
          </p>
          <h3 className="mt-1 truncate text-xl font-bold">{classTitle}</h3>
        </div>
        <Button variant="outline" size="sm" onClick={leaveRoom} disabled={starting}>
          <LogOut className="h-4 w-4" /> {isHost ? "Close room" : "Leave class"}
        </Button>
      </div>

      {error && <p role="status" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {starting ? (
        <div className="flex min-h-48 items-center justify-center gap-2 text-muted-foreground">
          <LoaderCircle className="h-5 w-5 animate-spin" /> Connecting to your camera and microphone…
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative aspect-video overflow-hidden rounded-md bg-muted">
              <video ref={localVideoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
              <span className="absolute bottom-2 left-2 rounded bg-background/80 px-2 py-1 text-xs font-semibold">You</span>
            </div>
            {Array.from(remoteStreams.entries()).map(([peerId, stream], index) => (
              <div key={peerId} className="relative aspect-video overflow-hidden rounded-md bg-muted">
                <video
                  ref={(node) => {
                    if (node) {
                      node.srcObject = stream;
                      remoteVideoRefs.current.set(peerId, node);
                    } else {
                      remoteVideoRefs.current.delete(peerId);
                    }
                  }}
                  autoPlay
                  playsInline
                  className="h-full w-full object-cover"
                />
                <span className="absolute bottom-2 left-2 rounded bg-background/80 px-2 py-1 text-xs font-semibold">
                  {isHost ? `Student ${index + 1}` : "Teacher"}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button type="button" variant={microphoneEnabled ? "outline" : "secondary"} size="icon" aria-label={microphoneEnabled ? "Mute microphone" : "Turn on microphone"} onClick={() => toggleTrack("audio")}>
              {microphoneEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </Button>
            <Button type="button" variant={cameraEnabled ? "outline" : "secondary"} size="icon" aria-label={cameraEnabled ? "Turn off camera" : "Turn on camera"} onClick={() => toggleTrack("video")}>
              {cameraEnabled ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
            </Button>
            {isHost && (
              <Button type="button" variant={recording ? "destructive" : "default"} onClick={recording ? stopRecording : () => void startRecording()}>
                {recording ? <Square className="h-4 w-4" /> : <Radio className="h-4 w-4" />}
                {recording ? "Stop & save recording" : "Record class"}
              </Button>
            )}
            {!isHost && <span className="flex items-center gap-2 text-sm text-muted-foreground"><Video className="h-4 w-4" /> Your teacher is hosting this class.</span>}
            {isHost && recording && <span className="text-sm font-medium text-destructive">Recording</span>}
            {isHost && <Button type="button" variant="ghost" className="ml-auto" onClick={onEndClass} disabled={recording || starting}>End class</Button>}
          </div>
        </>
      )}
    </section>
  );
}