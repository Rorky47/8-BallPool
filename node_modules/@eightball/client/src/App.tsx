import { useEffect, useMemo, useRef, useState } from "react";
import type { GameSnapshot, ServerToClient } from "@eightball/shared";
import { getSocket, onServerMessage, send } from "./net/socket";
import { GameCanvas } from "./game/GameCanvas";
import type { AimState } from "./game/input/controls";
import { loadKeyBindings, saveKeyBindings, type KeyBindings } from "./game/input/keybindings";

type SnapshotWithReceive = { receivedAtMs: number; roomId: string; snapshot: GameSnapshot };

export function App() {
  const [connected, setConnected] = useState(false);
  const [rttMs, setRttMs] = useState<number | null>(null);
  const [inQueue, setInQueue] = useState(false);
  const [queuePos, setQueuePos] = useState<number | null>(null);

  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerIndex, setPlayerIndex] = useState<0 | 1 | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotWithReceive[]>([]);
  const [lastResult, setLastResult] = useState<{ reason: "game_over" | "forfeit"; winner: 0 | 1 | null } | null>(null);

  const [aim, setAim] = useState<AimState>({ seq: 0, aimAngleRad: 0, power01: 0.35 });
  const [snapAngles, setSnapAngles] = useState(false);
  const [showAimGuide, setShowAimGuide] = useState(true);
  const [bindings, setBindings] = useState<KeyBindings>(() => loadKeyBindings());
  const [showKeybinds, setShowKeybinds] = useState(false);
  const [rebinding, setRebinding] = useState<keyof KeyBindings | null>(null);

  const visibleSnapshots = useMemo(() => {
    if (!roomId) return [];
    return snapshots.filter((s) => s.roomId === roomId).slice(-2);
  }, [roomId, snapshots]);

  const latest = visibleSnapshots[visibleSnapshots.length - 1]?.snapshot ?? null;
  const latestState = latest?.state ?? null;

  const roomIdRef = useRef<string | null>(null);
  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  const enabledControls =
    roomId !== null &&
    playerIndex !== null &&
    (latestState?.phase === "aim" || latestState?.phase === "ball_in_hand") &&
    latestState.currentPlayer === playerIndex;

  const aimSendRef = useRef({ lastSentAt: 0 });
  const placeSendRef = useRef({ lastSentAt: 0 });
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    saveKeyBindings(bindings);
  }, [bindings]);

  useEffect(() => {
    if (!rebinding) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      setBindings((prev) => ({ ...prev, [rebinding]: e.code }));
      setRebinding(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [rebinding]);

  const statusText = useMemo(() => {
    if (!latestState) return "waiting for snapshot…";
    if (latestState.phase === "simulating") return "balls moving";
    if (latestState.phase === "aim") return enabledControls ? "your turn" : "opponent aiming";
    if (latestState.phase === "ball_in_hand") return enabledControls ? "ball in hand" : "opponent has ball in hand";
    return latestState.phase;
  }, [enabledControls, latestState]);

  useEffect(() => {
    const s = getSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);

    const off = onServerMessage((msg: ServerToClient) => {
      if (msg.t === "pong") {
        setRttMs(Date.now() - msg.clientTimeMs);
        return;
      }

      if (msg.t === "queue/status") {
        setInQueue(msg.inQueue);
        setQueuePos(msg.position ?? null);
        return;
      }

      if (msg.t === "match/found") {
        setRoomId(msg.roomId);
        setPlayerIndex(msg.playerIndex);
        setInQueue(false);
        setQueuePos(null);
        // Keep any snapshots we might have already received for this room
        // (server may send snapshot before match/found).
        setSnapshots((prev) => prev.filter((s) => s.roomId === msg.roomId).slice(-2));
        setLastResult(null);
        return;
      }

      if (msg.t === "match/ended") {
        setLastResult({ reason: msg.reason, winner: msg.winner });
        setRoomId(null);
        setPlayerIndex(null);
        setSnapshots([]);
        setInQueue(false);
        setQueuePos(null);
        return;
      }

      if (msg.t === "game/snapshot") {
        const receivedAtMs = performance.now();
        setSnapshots((prev) => {
          const next = [...prev, { receivedAtMs, roomId: msg.roomId, snapshot: msg.snapshot }];
          // Keep only recent snapshots overall (and filtering happens per-room for rendering)
          return next.slice(-20);
        });
        return;
      }

      if (msg.t === "error") {
        // Keep it simple for now.
        alert(`${msg.code}: ${msg.message}`);
        return;
      }
    });

    s.connect();
    return () => {
      off();
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.disconnect();
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!connected) return;
      send({ t: "ping", clientTimeMs: Date.now() });
    }, 2000);
    return () => window.clearInterval(id);
  }, [connected]);

  const joinQueue = () => {
    send({ t: "queue/join" });
  };
  const leaveQueue = () => {
    send({ t: "queue/leave" });
  };
  const leaveMatch = () => {
    if (!roomId) return;
    send({ t: "match/leave", roomId });
    setRoomId(null);
    setPlayerIndex(null);
    setSnapshots([]);
  };

  const sendAim = (next: AimState) => {
    if (!roomId) return;
    if (!enabledControls) return;
    if (latestState?.phase !== "aim") return;
    const now = performance.now();
    if (now - aimSendRef.current.lastSentAt < 33) return; // ~30Hz
    aimSendRef.current.lastSentAt = now;

    send({
      t: "game/aim",
      roomId,
      seq: next.seq,
      aimAngleRad: next.aimAngleRad,
      power01: next.power01
    });
  };

  const onAimChange = (next: AimState) => {
    setAim(next);
    sendAim(next);
  };

  const onShoot = (shot: AimState) => {
    if (!roomId) return;
    if (!enabledControls) return;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        audioRef.current ??= new Ctx();
        const ctx = audioRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = 220;
        gain.gain.value = 0.06;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const t0 = ctx.currentTime;
        gain.gain.setValueAtTime(0.06, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
        osc.start(t0);
        osc.stop(t0 + 0.07);
      }
    } catch {
      // ignore
    }
    send({
      t: "game/shoot",
      roomId,
      seq: shot.seq,
      clientShotId: (crypto as unknown as { randomUUID?: () => string }).randomUUID?.() ?? String(Date.now()),
      aimAngleRad: shot.aimAngleRad,
      power01: shot.power01
    });
  };

  const onPlaceCue = (pos: { x: number; y: number }, seq: number) => {
    if (!roomId) return;
    if (!enabledControls) return;
    if (latestState?.phase !== "ball_in_hand") return;
    const now = performance.now();
    if (now - placeSendRef.current.lastSentAt < 33) return;
    placeSendRef.current.lastSentAt = now;
    send({ t: "game/place_cue", roomId, seq, x: pos.x, y: pos.y });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        background: "#0b0f14",
        color: "white"
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.08)"
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontWeight: 700 }}>8-Ball Pool</div>
          <div style={{ opacity: 0.7, fontSize: 12 }}>
            {connected ? "connected" : "disconnected"}
            {rttMs !== null ? ` • ${rttMs}ms` : ""}
            {" • "}
            {statusText}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, opacity: 0.9 }}>
            <input
              type="checkbox"
              checked={showAimGuide}
              onChange={(e) => setShowAimGuide(e.target.checked)}
            />
            Aim guide
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, opacity: 0.9 }}>
            <input type="checkbox" checked={snapAngles} onChange={(e) => setSnapAngles(e.target.checked)} />
            Snap angles
          </label>
          <button
            onClick={() => {
              setShowKeybinds((v) => {
                const next = !v;
                if (!next) setRebinding(null);
                return next;
              });
            }}
            style={{ padding: "8px 10px" }}
          >
            {showKeybinds ? "Close keys" : "Keys"}
          </button>
        </div>
      </header>

      <main style={{ padding: 16 }}>
        {showKeybinds && (
          <div
            style={{
              maxWidth: 720,
              margin: "0 auto 12px",
              padding: 12,
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              background: "rgba(255,255,255,0.04)"
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Key bindings</div>
            <div style={{ opacity: 0.75, fontSize: 12, marginBottom: 10 }}>
              Click a binding, then press a key. Uses KeyboardEvent.code (layout-independent).
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
              {(
                [
                  ["aimLeft", "Aim left"],
                  ["aimRight", "Aim right"],
                  ["powerUp", "Power up"],
                  ["powerDown", "Power down"],
                  ["shoot", "Shoot"]
                ] as const
              ).map(([k, label]) => (
                <div key={k} style={{ display: "contents" }}>
                  <div style={{ opacity: 0.85 }}>{label}</div>
                  <button
                    onClick={() => setRebinding(k)}
                    style={{ padding: "6px 10px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  >
                    {rebinding === k ? "press a key…" : bindings[k]}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {roomId === null ? (
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <h2 style={{ margin: "12px 0" }}>Quick Match</h2>
            <p style={{ opacity: 0.75, marginTop: 0 }}>
              Controls: mouse aims • wheel adjusts power • A/D fine aim • W/S power • Space shoots
            </p>
            {lastResult && (
              <p style={{ opacity: 0.85 }}>
                Last match:{" "}
                <strong>
                  {lastResult.winner === null ? "ended" : `player ${lastResult.winner + 1} won`}
                </strong>{" "}
                ({lastResult.reason})
              </p>
            )}

            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {!inQueue ? (
                <button onClick={joinQueue} disabled={!connected} style={{ padding: "10px 14px" }}>
                  Find match
                </button>
              ) : (
                <button onClick={leaveQueue} style={{ padding: "10px 14px" }}>
                  Leave queue
                </button>
              )}
              <div style={{ opacity: 0.8, fontSize: 12 }}>
                {inQueue ? `In queue${queuePos ? ` (pos ${queuePos})` : ""}…` : "Not in queue"}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ height: "calc(100vh - 96px)", maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <button onClick={leaveMatch} style={{ padding: "8px 12px" }}>
                Leave match
              </button>
            </div>
            <GameCanvas
              snapshots={visibleSnapshots}
              enabledControls={enabledControls}
              aim={aim}
              onAimChange={onAimChange}
              onPlaceCue={onPlaceCue}
              onShoot={onShoot}
              settings={{ snapAngles, showAimGuide, bindings }}
            />
          </div>
        )}
      </main>
    </div>
  );
}

