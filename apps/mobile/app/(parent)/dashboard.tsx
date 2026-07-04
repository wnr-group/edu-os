import { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, Image, FlatList, Dimensions, RefreshControl, Modal, StatusBar } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Animated, { FadeInDown, FadeInRight, useSharedValue, useAnimatedStyle, withTiming, runOnJS } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { supabase, fixStorageUrl, SCHOOL_ID } from "../../lib/supabase";
import { useActiveContext } from "../../lib/active-context";
import { useTheme } from "../../lib/theme";
import { Skeleton, SkeletonCard } from "../../components/Skeleton";
import { Avatar } from "../../components/Avatar";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const CAROUSEL_HEIGHT = 180;

interface GalleryItem { id: string; image_url: string; caption: string | null }
interface StudentInfo {
  id: string;
  name: string;
  className: string;
  sectionName: string;
  rollNumber: string;
  admissionNumber: string;
  photoUrl: string | null;
}
interface DashboardData {
  parentName: string;
  student: StudentInfo | null;
  attendancePct: number;
  pendingFees: number;
  homeworkDue: number;
  announcements: { id: string; title: string; created_at: string }[];
  gallery: GalleryItem[];
}

export default function ParentDashboard() {
  const theme = useTheme();
  const router = useRouter();
  const { studentId: activeStudentId } = useActiveContext();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const carouselRef = useRef<FlatList>(null);

  useEffect(() => { loadDashboard(); }, [activeStudentId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  }, [activeStudentId]);

  async function loadDashboard() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (!activeStudentId) {
      const { data: profileData } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
      setData({
        parentName: profileData?.full_name ?? "Parent",
        student: null,
        attendancePct: 0,
        pendingFees: 0,
        homeworkDue: 0,
        announcements: [],
        gallery: [],
      });
      setLoading(false);
      return;
    }

    const [profileRes, spRes] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).single(),
      supabase
        .from("student_profiles")
        .select("id, full_name, admission_number, photo_url, student_enrollments(roll_number, section_id, sections(id, name, classes(name)))")
        .eq("id", activeStudentId)
        .maybeSingle(),
    ]);

    const schoolId = SCHOOL_ID;
    const sp = spRes.data as any;
    const studentId = sp?.id;
    const activeEnrollment = (sp?.student_enrollments ?? []).find((e: any) => e.sections);

    const [attendanceRes, feesRes, homeworkRes, announcementsRes, galleryRes] = await Promise.all([
      studentId
        ? supabase.from("attendance_records").select("status").eq("student_id", studentId)
        : Promise.resolve({ data: [] }),
      studentId
        ? supabase.from("fee_line_items").select("total_amount, status").eq("student_id", studentId).neq("status", "paid")
        : Promise.resolve({ data: [] }),
      activeEnrollment?.sections?.id
        ? supabase.from("homework").select("id").eq("section_id", activeEnrollment.sections.id).gte("due_date", new Date().toISOString().split("T")[0])
        : Promise.resolve({ data: [] }),
      schoolId
        ? supabase.from("announcements").select("id, title, created_at").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(5)
        : Promise.resolve({ data: [] }),
      schoolId
        ? supabase.from("school_gallery").select("id, image_url, caption").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(5)
        : Promise.resolve({ data: [] }),
    ]);

    const attendanceData = attendanceRes.data ?? [];
    const totalDays = attendanceData.length;
    const presentDays = attendanceData.filter((r: any) => r.status === "present" || r.status === "late").length;
    const pendingFees = (feesRes.data ?? []).reduce((s: number, f: any) => s + Number(f.total_amount ?? 0), 0);

    const student: StudentInfo | null = sp ? {
      id: sp.id,
      name: sp.full_name ?? "Student",
      className: activeEnrollment?.sections?.classes?.name ?? "",
      sectionName: activeEnrollment?.sections?.name ?? "",
      rollNumber: activeEnrollment?.roll_number ?? "",
      admissionNumber: sp.admission_number ?? "",
      photoUrl: sp.photo_url ? fixStorageUrl(sp.photo_url) : null,
    } : null;

    setData({
      parentName: profileRes.data?.full_name ?? "Parent",
      student,
      attendancePct: totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0,
      pendingFees,
      homeworkDue: homeworkRes.data?.length ?? 0,
      announcements: announcementsRes.data ?? [],
      gallery: (galleryRes.data ?? []).map((g: any) => ({ ...g, image_url: fixStorageUrl(g.image_url) })),
    });
    setLoading(false);
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const quickActions = [
    { icon: "wallet-outline" as const, label: "Pay Fees", route: "/(parent)/fees", color: "#4f46e5" },
    { icon: "trophy-outline" as const, label: "Results", route: "/(parent)/academics", color: "#059669" },
    { icon: "book-outline" as const, label: "Homework", route: "/(parent)/academics", color: "#d97706" },
    { icon: "megaphone-outline" as const, label: "News", route: "/(parent)/more?section=announcements", color: "#dc2626" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: "#ffffff" }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* ── Greeting ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
          <Animated.View entering={FadeInDown.duration(500).delay(100)}>
            {loading ? <Skeleton height={28} width="60%" /> : (
              <Text style={{ fontSize: 24, fontFamily: "Inter_700Bold", color: "#111827" }}>
                {greeting}, {data?.parentName?.split(" ")[0]} 👋
              </Text>
            )}
          </Animated.View>
        </View>

        {/* ── Student card ── */}
        {!loading && data?.student && (
          <Animated.View
            entering={FadeInDown.duration(500).delay(200)}
            style={{
              marginHorizontal: 20,
              backgroundColor: "#f8fafc",
              borderRadius: 16,
              padding: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              borderWidth: 1,
              borderColor: "#e5e7eb",
            }}
          >
            {data.student.photoUrl ? (
              <Image source={{ uri: data.student.photoUrl }} style={{ width: 44, height: 44, borderRadius: 12 }} resizeMode="cover" />
            ) : (
              <Avatar name={data.student.name} size={44} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#111827" }}>{data.student.name}</Text>
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: "#4f46e5", marginTop: 1 }}>
                {data.student.className} {data.student.sectionName}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#ecfdf5", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#10b981" }} />
              <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#059669" }}>Active</Text>
            </View>
          </Animated.View>
        )}

        {/* ── Stats strip ── */}
        <Animated.View entering={FadeInDown.duration(500).delay(300)} style={{ flexDirection: "row", gap: 10, paddingHorizontal: 20, marginTop: 20 }}>
          {loading ? (
            [0,1,2].map(i => <View key={i} style={{ flex: 1 }}><SkeletonCard /></View>)
          ) : (
            <>
              <View style={{ flex: 1, backgroundColor: "#f0fdf4", borderRadius: 14, padding: 14, alignItems: "center" }}>
                <Ionicons name="checkmark-circle" size={22} color="#059669" />
                <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: "#111827", marginTop: 6 }}>{data?.attendancePct}%</Text>
                <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "#6b7280", marginTop: 2 }}>Attendance</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: (data?.pendingFees ?? 0) > 0 ? "#fef3c7" : "#f0fdf4", borderRadius: 14, padding: 14, alignItems: "center" }}>
                <Ionicons name="wallet" size={22} color={(data?.pendingFees ?? 0) > 0 ? "#d97706" : "#059669"} />
                <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: "#111827", marginTop: 6 }}>₹{((data?.pendingFees ?? 0) / 1000).toFixed(0)}k</Text>
                <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "#6b7280", marginTop: 2 }}>Pending</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: (data?.homeworkDue ?? 0) > 0 ? "#fef2f2" : "#f0fdf4", borderRadius: 14, padding: 14, alignItems: "center" }}>
                <Ionicons name="book" size={22} color={(data?.homeworkDue ?? 0) > 0 ? "#dc2626" : "#059669"} />
                <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: "#111827", marginTop: 6 }}>{data?.homeworkDue}</Text>
                <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "#6b7280", marginTop: 2 }}>Due Today</Text>
              </View>
            </>
          )}
        </Animated.View>

        {/* ── Quick actions ── */}
        <Animated.View entering={FadeInDown.duration(500).delay(400)} style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#111827", marginBottom: 12 }}>Quick Actions</Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            {quickActions.map((action, i) => (
              <Animated.View key={action.label} entering={FadeInRight.duration(400).delay(450 + i * 80)} style={{ flex: 1 }}>
                <TouchableOpacity
                  onPress={() => router.push(action.route as any)}
                  style={{ backgroundColor: "#ffffff", borderRadius: 14, padding: 14, alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#f3f4f6" }}
                  activeOpacity={0.7}
                >
                  <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: `${action.color}12`, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name={action.icon} size={20} color={action.color} />
                  </View>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "#374151", textAlign: "center" }}>{action.label}</Text>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        </Animated.View>

        {/* ── Gallery carousel ── */}
        {!loading && (data?.gallery?.length ?? 0) > 0 && (
          <Animated.View entering={FadeInDown.duration(500).delay(500)} style={{ marginTop: 24 }}>
            <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#111827", paddingHorizontal: 20, marginBottom: 12 }}>School Gallery</Text>
            <FlatList
              ref={carouselRef}
              data={data!.gallery}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              snapToInterval={SCREEN_WIDTH - 40}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              decelerationRate="fast"
              keyExtractor={(item) => item.id}
              onMomentumScrollEnd={(e) => {
                setActiveSlide(Math.round(e.nativeEvent.contentOffset.x / (SCREEN_WIDTH - 40)));
              }}
              renderItem={({ item, index }) => (
                <TouchableOpacity activeOpacity={0.9} onPress={() => setViewerIndex(index)} style={{ width: SCREEN_WIDTH - 40, height: CAROUSEL_HEIGHT, borderRadius: 16, overflow: "hidden", marginRight: 12 }}>
                  <Image source={{ uri: item.image_url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                  {item.caption && (
                    <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "rgba(0,0,0,0.5)", borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
                      <Text style={{ color: "#fff", fontSize: 13, fontFamily: "Inter_500Medium" }}>{item.caption}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            />
            {data!.gallery.length > 1 && (
              <View style={{ flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 10 }}>
                {data!.gallery.map((_, i) => (
                  <View key={i} style={{ width: i === activeSlide ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === activeSlide ? "#4f46e5" : "#e5e7eb" }} />
                ))}
              </View>
            )}
          </Animated.View>
        )}

        {/* ── Full-screen gallery viewer ── */}
        <Modal visible={viewerIndex !== null} transparent animationType="fade" onRequestClose={() => setViewerIndex(null)} statusBarTranslucent>
          {viewerIndex !== null && data?.gallery && (
            <GalleryViewer
              items={data.gallery}
              initialIndex={viewerIndex}
              onClose={() => setViewerIndex(null)}
            />
          )}
        </Modal>

        {/* ── Latest news ── */}
        <Animated.View entering={FadeInDown.duration(500).delay(600)} style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#111827" }}>Latest News</Text>
            <TouchableOpacity onPress={() => router.push("/(parent)/more?section=announcements")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: "#4f46e5" }}>See all</Text>
            </TouchableOpacity>
          </View>
          {loading ? (
            <View style={{ gap: 8 }}><SkeletonCard /><SkeletonCard /></View>
          ) : (data?.announcements ?? []).length === 0 ? (
            <View style={{ backgroundColor: "#f9fafb", borderRadius: 12, padding: 20, alignItems: "center" }}>
              <Ionicons name="megaphone-outline" size={24} color="#9ca3af" />
              <Text style={{ color: "#6b7280", fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 8 }}>No announcements yet</Text>
            </View>
          ) : data!.announcements.map((a) => (
            <TouchableOpacity
              key={a.id}
              activeOpacity={0.6}
              onPress={() => router.push("/(parent)/more?section=announcements")}
              style={{ backgroundColor: "#f9fafb", borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#ede9fe", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="megaphone" size={16} color="#7c3aed" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: "#111827" }} numberOfLines={1}>{a.title}</Text>
                <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: "#9ca3af", marginTop: 2 }}>
                  {new Date(a.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
            </TouchableOpacity>
          ))}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function GalleryViewer({
  items,
  initialIndex,
  onClose,
}: {
  items: GalleryItem[];
  initialIndex: number;
  onClose: () => void;
}) {
  const listRef = useRef<FlatList>(null);
  const [current, setCurrent] = useState(initialIndex);
  // Paging is disabled while a page is zoomed in, so single-finger drags pan
  // the image instead of swiping to the next photo.
  const [pagingEnabled, setPagingEnabled] = useState(true);

  return (
    <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)" }}>
      <StatusBar barStyle="light-content" />
      <FlatList
        ref={listRef}
        data={items}
        horizontal
        pagingEnabled
        scrollEnabled={pagingEnabled}
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={(e) => {
          setCurrent(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH));
        }}
        renderItem={({ item }) => (
          <ZoomablePage uri={item.image_url} onZoomChange={(z) => setPagingEnabled(!z)} />
        )}
      />

      <TouchableOpacity
        onPress={onClose}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={{ position: "absolute", top: 56, right: 20, zIndex: 2, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}
      >
        <Ionicons name="close" size={24} color="#fff" />
      </TouchableOpacity>

      {items.length > 1 && (
        <View style={{ position: "absolute", top: 64, left: 0, right: 0, alignItems: "center" }}>
          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontFamily: "Inter_500Medium" }}>
            {current + 1} / {items.length}
          </Text>
        </View>
      )}

      {items[current]?.caption ? (
        <View style={{ position: "absolute", bottom: 60, left: 20, right: 20 }}>
          <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center" }}>{items[current].caption}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ZoomablePage({ uri, onZoomChange }: { uri: string; onZoomChange: (zoomed: boolean) => void }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const [zoomed, setZoomed] = useState(false);

  const applyZoom = useCallback((z: boolean) => {
    setZoomed(z);
    onZoomChange(z);
  }, [onZoomChange]);

  const reset = () => {
    "worklet";
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedX.value = 0;
    savedY.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 5));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) {
        reset();
        runOnJS(applyZoom)(false);
      } else {
        runOnJS(applyZoom)(true);
      }
    });

  // Pan is only active while zoomed; otherwise the FlatList handles the swipe
  // to the next photo. Panning is clamped so the image can't drift off-screen.
  const pan = Gesture.Pan()
    .enabled(zoomed)
    .onUpdate((e) => {
      const maxX = (SCREEN_WIDTH * (scale.value - 1)) / 2;
      const maxY = (SCREEN_HEIGHT * (scale.value - 1)) / 2;
      translateX.value = Math.max(-maxX, Math.min(savedX.value + e.translationX, maxX));
      translateY.value = Math.max(-maxY, Math.min(savedY.value + e.translationY, maxY));
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        reset();
        runOnJS(applyZoom)(false);
      } else {
        scale.value = withTiming(2);
        savedScale.value = 2;
        runOnJS(applyZoom)(true);
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={{ width: SCREEN_WIDTH, height: "100%", justifyContent: "center", alignItems: "center" }}>
        <Animated.Image
          source={{ uri }}
          style={[{ width: SCREEN_WIDTH, height: "70%" }, animatedStyle]}
          resizeMode="contain"
        />
      </Animated.View>
    </GestureDetector>
  );
}
