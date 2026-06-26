"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Activity, Contact } from "@/lib/types";

export function ActivityList({ activities: initialActivities, contacts }: { activities: Activity[]; contacts: Contact[] }) {
  const [activities, setActivities] = useState<Activity[]>(initialActivities);
  const [showDone, setShowDone] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const router = useRouter();

  function activityKey(activity: Activity) {
    const date = new Date(activity.dueAt);
    const day = Number.isNaN(date.getTime()) ? activity.dueAt.slice(0, 10) : date.toISOString().slice(0, 10);
    return `${activity.contactId}:${activity.title}:${day}:${activity.done ? "done" : "pending"}`;
  }

  const contactById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const dedupedActivities = useMemo(() => {
    const seen = new Set<string>();
    return [...activities]
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      })
      .filter((activity) => {
        const key = activityKey(activity);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [activities]);
  const pendingCount = useMemo(() => dedupedActivities.filter((activity) => !activity.done).length, [dedupedActivities]);
  const orderedActivities = useMemo(() => {
    return dedupedActivities
      .filter((activity) => showDone || !activity.done)
      .slice(0, 8);
  }, [dedupedActivities, showDone]);

  async function toggleDone(activity: Activity, done: boolean) {
    setUpdating(activity.id);
    try {
      const response = await fetch("/api/activities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: activity.id,
          done,
          completeSimilar: done,
          contactId: activity.contactId,
          title: activity.title,
          dueAt: activity.dueAt,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Erro ao atualizar tarefa.");

      setActivities((current) =>
        current.map((item) => (done && activityKey(item) === activityKey(activity)) || item.id === activity.id ? { ...item, done } : item),
      );
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
        <strong>{pendingCount ? "Sem tarefas nesta visualização." : "Nenhuma tarefa pendente."}</strong>
        <p className="muted">Quando um lead entrar ou você agendar follow-up, o sistema mostra aqui.</p>
        {activities.some((activity) => activity.done) && (
          <button className="btn mini secondary" onClick={() => setShowDone(!showDone)}>
            {showDone ? "Ocultar concluídas" : "Mostrar concluídas"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="activity-list">
      <div className="activity-toolbar">
        <span className="muted">{pendingCount} pendente{pendingCount === 1 ? "" : "s"}</span>
        {activities.some((activity) => activity.done) && (
          <button className="btn mini secondary" onClick={() => setShowDone(!showDone)}>
            {showDone ? "Ocultar concluídas" : "Mostrar concluídas"}
          </button>
        )}
      </div>

      {orderedActivities.map((activity) => {
        const contact = contactById.get(activity.contactId);
        const due = new Date(activity.dueAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
        return (
          <div key={activity.id} className={`activity-card ${activity.done ? "done" : ""}`}>
            <div>
              <strong>{activity.title}</strong>
              <p className="muted" style={{ margin: "5px 0 0" }}>{contact?.name || "Lead"} • {due}</p>
            </div>
            <div className="activity-actions">
              <Link className="btn mini secondary" href={`/inbox?contact=${activity.contactId}`}>Abrir</Link>
              <button className="btn mini secondary" onClick={() => toggleDone(activity, !activity.done)} disabled={updating === activity.id}>
                {updating === activity.id ? "Salvando..." : activity.done ? "Reabrir" : "Concluir"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
