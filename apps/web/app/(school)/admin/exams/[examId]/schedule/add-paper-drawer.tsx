"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

export interface SlotFormValues {
  classId: string;
  subjectId: string;
  examDate: string;
  startTime: string;
  endTime: string;
  roomId: string;
  invigilatorId: string;
}

interface ClassOption { id: string; name: string; order: number }
interface SubjectOption { id: string; name: string; class_id: string }
interface TeacherOption { id: string; name: string }
interface RoomOption { id: string; name: string; capacity: number | null }
interface Slot {
  id: string;
  class_id: string;
  subject_id: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  room_id: string | null;
  invigilator_id: string | null;
}

interface Props {
  schoolId: string;
  examId: string;
  classes: ClassOption[];
  subjects: SubjectOption[];
  teachers: TeacherOption[];
  rooms: RoomOption[];
  defaultClassId: string;
  editingSlot: Slot | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function AddPaperForm({
  schoolId,
  examId,
  classes,
  subjects,
  teachers,
  rooms,
  defaultClassId,
  editingSlot,
  onSaved,
  onCancel,
}: Props) {
  const [classId, setClassId] = useState(editingSlot?.class_id ?? defaultClassId);
  const [subjectId, setSubjectId] = useState(editingSlot?.subject_id ?? "");
  const [examDate, setExamDate] = useState(editingSlot?.exam_date ?? "");
  const [startTime, setStartTime] = useState(editingSlot?.start_time?.slice(0, 5) ?? "");
  const [endTime, setEndTime] = useState(editingSlot?.end_time?.slice(0, 5) ?? "");
  const [roomId, setRoomId] = useState(editingSlot?.room_id ?? "");
  const [invigilatorId, setInvigilatorId] = useState(editingSlot?.invigilator_id ?? "");
  const [localRooms, setLocalRooms] = useState(rooms);
  const [newRoomName, setNewRoomName] = useState("");
  const [addingRoom, setAddingRoom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clashError, setClashError] = useState<string | null>(null);

  const subjectsForClass = subjects.filter((s) => s.class_id === classId);

  async function handleAddRoom() {
    if (!newRoomName.trim()) return;
    setAddingRoom(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("rooms")
      .insert({ school_id: schoolId, name: newRoomName.trim() })
      .select("id, name, capacity")
      .single();
    setAddingRoom(false);
    if (error) {
      toast.error(error.code === "23505" ? "A room with that name already exists." : error.message);
      return;
    }
    setLocalRooms((prev) => [...prev, data]);
    setRoomId(data.id);
    setNewRoomName("");
    toast.success("Room added.");
  }

  async function handleSave() {
    if (!classId || !subjectId || !examDate || !startTime || !endTime) return;
    setClashError(null);
    setSaving(true);
    const supabase = createClient();
    const payload = {
      school_id: schoolId,
      exam_id: examId,
      class_id: classId,
      subject_id: subjectId,
      exam_date: examDate,
      start_time: startTime,
      end_time: endTime,
      room_id: roomId || null,
      invigilator_id: invigilatorId || null,
    };
    const { error } = editingSlot
      ? await supabase.from("exam_schedule_slots").update(payload).eq("id", editingSlot.id)
      : await supabase.from("exam_schedule_slots").upsert(payload, { onConflict: "exam_id,class_id,subject_id" });
    setSaving(false);

    if (error) {
      // The clash trigger's RAISE EXCEPTION message surfaces here verbatim —
      // same idiom as timetable-grid.tsx:206's error.code/error.message handling.
      if (error.code === "23505") {
        setClashError("This class already has a paper for that subject in this exam.");
      } else {
        setClashError(error.message);
      }
      return;
    }

    toast.success(editingSlot ? "Paper updated." : "Paper added.");
    onSaved();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">{editingSlot ? "Edit paper" : "Add paper"}</h3>
        <span className="text-xs text-muted-foreground">
          {classes.find((c) => c.id === classId)?.name ? `Class ${classes.find((c) => c.id === classId)?.name}` : ""}
        </span>
      </div>

      <div className="space-y-1.5">
        <Label>Class</Label>
        <NativeSelect
          options={classes.map((c) => ({ value: c.id, label: c.name }))}
          value={classId}
          onChange={(e) => { setClassId(e.target.value); setSubjectId(""); }}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Subject</Label>
        <NativeSelect
          options={subjectsForClass.map((s) => ({ value: s.id, label: s.name }))}
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          placeholder="Select subject…"
          disabled={!classId}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Date</Label>
        <Input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Start</Label>
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>End</Label>
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Room (optional)</Label>
        <NativeSelect
          options={localRooms.map((r) => ({ value: r.id, label: r.name }))}
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          placeholder="No room set"
        />
        <div className="flex items-center gap-2 pt-1">
          <Input
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            placeholder="+ New room name"
            className="h-8 text-xs"
          />
          <Button type="button" variant="outline" size="sm" onClick={handleAddRoom} disabled={addingRoom || !newRoomName.trim()}>
            Add
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Invigilator (optional)</Label>
        <NativeSelect
          options={teachers.map((t) => ({ value: t.id, label: t.name }))}
          value={invigilatorId}
          onChange={(e) => setInvigilatorId(e.target.value)}
          placeholder="Pick from teachers…"
        />
      </div>

      {clashError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>{clashError}</p>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving || !classId || !subjectId || !examDate || !startTime || !endTime}>
          {saving ? "Saving…" : editingSlot ? "Save changes" : "Add paper"}
        </Button>
      </div>
    </div>
  );
}