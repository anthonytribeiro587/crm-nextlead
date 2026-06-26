"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Activity, Contact } from "@/lib/types";

export function ActivityList({ activities: initialActivities, contacts }: { activities: Activity[]; contacts: Contact[] }) {
  const [activities, setActivities] = useState<Activity[]>(initialActivities);
  const [updating, setUpdating] = useState<string | null>(null);
  const router = useRouter();

  const contactById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const orderedActivities = useMemo(() => {
    return [...activities]
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      })
      .slice(0, 8);
  }, [activities]);

  async function toggleDone(activity: Activity, done: boolean) {
    setUpdating(activity.id);
    try {
      const response = await fetch("/api/activities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityId: activity.id, done }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Erro ao atualizar tarefa.");

      setActivities((current) => current.map((item) => (item.id === activity.id ? { ...item, done } : item)));
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Erro ao atualizar tarefa.");
    } finally {
      setUpdating(null);
    }
  }

  if (!orderedActivities.length) {
    return (
      <div className="empty-state">
        <strong>Nenhuma tarefa ainda.</strong>
        <p className="muted">Quando um lead entrar, o sistema cria uma tarefa de primeiro contato automaticamente.</p>
      </div>
    );
  }

  return (
    <div className="activity-list">
      {orderedActivities.map((activity) => {
        const contact = contactById.get(activity.contactId);
        const due = new Date(activity.dueAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
        return (
          <div key={activity.id} className={`activity-card ${activity.done ? "done" : ""}`}>
            <div>
              <strong>{activity.title}</strong>
              <p className="muted" style={{ margin: "5px 0 0" }}>{contact?.name || "Lead"} • {due}</p>
            </div>
            <button className="btn mini secondary" onClick={() => toggleDone(activity, !activity.done)} disabled={updating === activity.id}>
              {updating === activity.id ? "Salvando..." : activity.done ? "Reabrir" : "Concluir"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
