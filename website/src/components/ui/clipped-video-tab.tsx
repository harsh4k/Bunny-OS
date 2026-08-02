"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  Lock,
  Brain,
  Monitor,
  CheckCircle2,
  LoaderCircle,
  Circle,
} from "lucide-react";

const items = [
  {
    icon: Mic,
    label: "Voice",
    title: "Hold F9 to talk",
    description:
      "Push-to-talk stays on your PC. Speech is transcribed in memory — raw audio is never written to disk.",
    image:
      "https://images.unsplash.com/photo-1589903308904-1010c2294adc?auto=format&fit=crop&w=1600&q=80",
    card: {
      heading: "Push-to-talk",
      badge: "Local",
      goal: "Listen, understand a request, and act with allowlisted tools only.",
      tasks: [
        { title: "Capture audio in memory", meta: "Done", status: "completed" },
        { title: "Transcribe with Whisper", meta: "Done", status: "completed" },
        { title: "Match voice intent", meta: "Running…", status: "progress" },
        { title: "Speak the result", meta: "Pending", status: "pending" },
      ],
    },
  },
  {
    icon: Lock,
    label: "Privacy",
    title: "Nothing phones home",
    description:
      "No Bunny telemetry cloud. Ollama and Whisper run on your machine. You control Memory and Screen context.",
    image:
      "https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=1600&q=80",
    card: {
      heading: "Local by design",
      badge: "DPDP-ready",
      goal: "Keep personal data on this device unless you open a site yourself.",
      tasks: [
        { title: "Mic starts muted", meta: "Default", status: "completed" },
        { title: "No cloud AI for Bunny", meta: "Default", status: "completed" },
        { title: "Confirm risky browser acts", meta: "Required", status: "progress" },
        { title: "Review Privacy Policy", meta: "Optional", status: "pending" },
      ],
    },
  },
  {
    icon: Brain,
    label: "Chat",
    title: "Local models via Ollama",
    description:
      "First-run can install official Ollama and a small model. Cancel anytime. Chat never leaves your PC for Bunny servers.",
    image:
      "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1600&q=80",
    card: {
      heading: "Ollama chat",
      badge: "On-device",
      goal: "Answer questions and plan allowlisted actions without a Bunny account.",
      tasks: [
        { title: "Detect Ollama", meta: "Done", status: "completed" },
        { title: "Pull default model", meta: "If needed", status: "completed" },
        { title: "Stream reply", meta: "Running…", status: "progress" },
        { title: "Cancel if stuck", meta: "Ready", status: "pending" },
      ],
    },
  },
  {
    icon: Monitor,
    label: "Desktop",
    title: "Apps, YouTube, media",
    description:
      "Open apps, search YouTube, media keys, optional screen UI text when you turn Screen on — still local, still allowlisted.",
    image:
      "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1600&q=80",
    card: {
      heading: "Allowlisted actions",
      badge: "Safe",
      goal: "Do useful desktop chores without free-form shell access.",
      tasks: [
        { title: "Scan installed apps", meta: "Onboarding", status: "completed" },
        { title: "Open / search / play", meta: "Voice or chat", status: "completed" },
        { title: "Confirm type & click", meta: "When needed", status: "progress" },
        { title: "Screen context (opt-in)", meta: "Off by default", status: "pending" },
      ],
    },
  },
];

export default function ClippedFeatureTabs() {
  const [activeTab, setActiveTab] = useState(0);
  const activeItem = items[activeTab];

  return (
    <section id="features" className="overflow-hidden bg-[#f5f5f3] py-20">
      <div className="mx-auto mb-10 max-w-7xl px-6">
        <div className="grid items-start gap-10 md:grid-cols-2 md:gap-14">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <Image
                src="/bunny-os.jpg"
                alt="Bunny OS"
                width={44}
                height={44}
                className="rounded-xl border border-black/10 bg-black"
              />
              <span className="text-xs font-semibold tracking-[0.16em] text-[#9a7f56] uppercase">
                Bunny OS
              </span>
            </div>
            <h2 className="max-w-2xl text-[40px] leading-[1.1] font-bold tracking-tight text-[#131313] sm:text-[46px] sm:leading-[50px]">
              What Bunny can do
            </h2>
          </div>
          <p className="max-w-lg text-[18px] leading-[32px] text-[#666]">
            Built for people who want a voice helper that stays on their computer —
            Windows and Mac, no account, no Bunny cloud.
          </p>
        </div>
      </div>

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="absolute bottom-10 left-2 z-20 sm:bottom-16">
          <div className="w-[220px] rounded-[28px] border border-[#e8e8e8] bg-white p-3 shadow-xl sm:w-[240px]">
            <div className="flex flex-col gap-2">
              {items.map((tab, index) => {
                const Icon = tab.icon;
                const active = activeTab === index;
                return (
                  <button
                    key={tab.label}
                    type="button"
                    onClick={() => setActiveTab(index)}
                    className={`group flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-300 ${
                      active
                        ? "border-[#9a7f56] bg-[#faf6ef]"
                        : "border-transparent hover:border-[#9a7f56] hover:bg-[#faf6ef]"
                    }`}
                  >
                    <Icon
                      className={`h-5 w-5 transition-colors ${
                        active
                          ? "text-[#9a7f56]"
                          : "text-[#131313] group-hover:text-[#9a7f56]"
                      }`}
                    />
                    <span
                      className={`text-[15px] font-medium transition-colors ${
                        active
                          ? "text-[#9a7f56]"
                          : "text-[#131313] group-hover:text-[#9a7f56]"
                      }`}
                    >
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div
          className="relative h-[520px] overflow-hidden sm:h-[690px]"
          style={{
            clipPath:
              "polygon(0 0, 92% 0, 100% 12%, 100% 100%, 30% 100%, 22% 88%, 0 88%)",
            borderRadius: "34px",
          }}
        >
          <AnimatePresence mode="wait">
            <motion.img
              key={activeItem.image}
              src={activeItem.image}
              alt=""
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45 }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </AnimatePresence>
          <div className="absolute inset-0 bg-black/25" />

          <div className="absolute inset-0 flex items-center justify-center p-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeItem.card.heading}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 14 }}
                transition={{ duration: 0.35 }}
                className="w-full max-w-[320px] rounded-[26px] border border-white/30 bg-white/85 p-5 shadow-2xl backdrop-blur-xl"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[18px] font-semibold text-[#131313]">
                    {activeItem.card.heading}
                  </h3>
                  <span className="rounded-md bg-[#faf6ef] px-2 py-1 text-[11px] text-[#9a7f56]">
                    {activeItem.card.badge}
                  </span>
                </div>
                <div className="mt-4 rounded-xl border border-[#e7e7e7] p-3">
                  <p className="text-[11px] text-[#777]">Goal</p>
                  <p className="mt-1 text-[13px] leading-[20px] text-[#131313]">
                    {activeItem.card.goal}
                  </p>
                </div>
                <div className="mt-4 flex flex-col gap-3">
                  {activeItem.card.tasks.map((task) => (
                    <div key={task.title} className="flex items-start gap-2">
                      <div className="mt-[2px]">
                        {task.status === "completed" && (
                          <CheckCircle2 className="h-4 w-4 text-[#9a7f56]" />
                        )}
                        {task.status === "progress" && (
                          <LoaderCircle className="h-4 w-4 animate-spin text-[#9a7f56]" />
                        )}
                        {task.status === "pending" && (
                          <Circle className="h-4 w-4 text-[#bdbdbd]" />
                        )}
                      </div>
                      <div>
                        <p
                          className={`text-[13px] ${
                            task.status === "completed"
                              ? "text-[#666] line-through"
                              : task.status === "progress"
                                ? "font-medium text-[#9a7f56]"
                                : "text-[#999]"
                          }`}
                        >
                          {task.title}
                        </p>
                        <p className="text-[11px] text-[#999]">{task.meta}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-5 text-[12px] leading-relaxed text-[#666]">
                  {activeItem.description}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
