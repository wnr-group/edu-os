"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import Cookies from "js-cookie";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

interface AcademicYear {
  id: string;
  name: string;
  status: "draft" | "active" | "archived";
}

export function AcademicYearSwitcher({
  years,
  currentYearId,
}: {
  years: AcademicYear[];
  currentYearId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const current = years.find((y) => y.id === currentYearId) ?? years[0];

  function handleSelect(yearId: string) {
    setOpen(false);
    const hostname = window.location.hostname;
    Cookies.set("academic_year_id", yearId, {
      domain: hostname.includes("lvh.me")
        ? ".lvh.me"
        : hostname.includes("balajierp.com")
        ? ".balajierp.com"
        : undefined,
      expires: 365,
    });
    router.refresh();
  }

  if (years.length === 0) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <button className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/80 outline-none">
            {current?.name ?? "Select Year"}
            {current?.status === "draft" && (
              <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">
                Draft
              </span>
            )}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-40">
        {years.map((y) => (
          <DropdownMenuItem
            key={y.id}
            onClick={() => handleSelect(y.id)}
            className="flex w-full items-center justify-between px-3 py-2 text-sm cursor-pointer"
          >
            <span>{y.name}</span>
            <span
              className={`rounded-full px-1.5 text-[10px] font-semibold ${
                y.status === "active"
                  ? "bg-emerald-100 text-emerald-700"
                  : y.status === "draft"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {y.status}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
