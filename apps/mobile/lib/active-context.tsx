import { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, SCHOOL_ID, setActiveRoleHeader } from "./supabase";

export type MobileRole = "teacher" | "parent";

export interface StudentRef {
  id: string;
  fullName: string;
  className?: string | null;
}

interface ActiveContextValue {
  loading: boolean;
  roles: MobileRole[];
  students: StudentRef[];
  role: MobileRole | null;
  studentId: string | null;
  activeYearId: string | null;
  setRole: (r: MobileRole) => void;
  setStudent: (id: string) => void;
  hasAccess: boolean;
}

const Ctx = createContext<ActiveContextValue | null>(null);
const STORAGE_KEY = "active_context_v1";

/** Clear persisted role/student so the next account doesn't inherit it. */
export async function clearActiveContext() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export function ActiveContextProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  // Tracks which user the roles/students below were loaded for. Until this
  // matches the current userId, the context is still "loading" — this closes a
  // race where Gate (a child) runs its effect before this provider's effect on
  // login, briefly seeing the previous state (loading=false, no roles) and
  // bouncing to /no-access.
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [roles, setRoles] = useState<MobileRole[]>([]);
  const [students, setStudents] = useState<StudentRef[]>([]);
  const [role, setRoleState] = useState<MobileRole | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [activeYearId, setActiveYearId] = useState<string | null>(null);

  const persist = useCallback(async (r: MobileRole | null, s: string | null) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ role: r, studentId: s }));
  }, []);

  const setRole = useCallback((r: MobileRole) => {
    setRoleState(r);
    setActiveRoleHeader(r);
    persist(r, r === "parent" ? studentId : null);
  }, [studentId, persist]);

  const setStudent = useCallback((id: string) => {
    setStudentId(id);
    persist(role, id);
  }, [role, persist]);

  useEffect(() => {
    // Logged out: wipe any in-memory state from the previous account so a
    // stale role/student can't leak into the next session.
    if (!userId) {
      setRoles([]);
      setStudents([]);
      setRoleState(null);
      setStudentId(null);
      setActiveYearId(null);
      setActiveRoleHeader("");
      setLoadedUserId(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    // Re-enter the loading state for the new account so the router waits for
    // the fresh roles instead of acting on the previous user's role.
    setLoading(true);
    setRoleState(null);
    setRoles([]);

    (async () => {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("school_id", SCHOOL_ID)
        .eq("is_active", true);

      const mobileRoles = (roleRows ?? [])
        .map((r) => r.role as string)
        .filter((r): r is MobileRole => r === "teacher" || r === "parent");

      const { data: kids } = await supabase
        .from("student_profiles")
        .select("id, full_name")
        .eq("parent_profile_id", userId)
        .eq("school_id", SCHOOL_ID);

      const { data: activeYear } = await supabase
        .from("academic_years")
        .select("id")
        .eq("school_id", SCHOOL_ID)
        .eq("status", "active")
        .maybeSingle();

      if (cancelled) return;

      setActiveYearId(activeYear?.id ?? null);

      const studentRefs: StudentRef[] = (kids ?? []).map((k) => ({
        id: k.id as string,
        fullName: k.full_name as string,
      }));
      setRoles(mobileRoles);
      setStudents(studentRefs);

      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = stored ? (JSON.parse(stored) as { role: MobileRole | null; studentId: string | null }) : null;

      let nextRole: MobileRole | null = null;
      if (parsed?.role && mobileRoles.includes(parsed.role)) nextRole = parsed.role;
      else if (mobileRoles.includes("teacher")) nextRole = "teacher";
      else if (mobileRoles.includes("parent")) nextRole = "parent";

      let nextStudent: string | null = null;
      if (nextRole === "parent") {
        const validStored = parsed?.studentId && studentRefs.some((s) => s.id === parsed.studentId);
        nextStudent = validStored ? parsed!.studentId : (studentRefs[0]?.id ?? null);
      }

      setRoleState(nextRole);
      setStudentId(nextStudent);
      if (nextRole) setActiveRoleHeader(nextRole);
      setLoadedUserId(userId);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [userId]);

  // Still loading if the fetch is in flight OR the loaded data is for a
  // different user than the current one (covers the login effect-order race).
  const effectiveLoading = loading || loadedUserId !== userId;
  const hasAccess = roles.length > 0;

  return (
    <Ctx.Provider
      value={{ loading: effectiveLoading, roles, students, role, studentId, activeYearId, setRole, setStudent, hasAccess }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useActiveContext() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useActiveContext must be used within ActiveContextProvider");
  return v;
}
