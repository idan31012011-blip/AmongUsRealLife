import { useState, useRef, useCallback, useEffect } from 'react';
import Modal from './Modal';
import socket from '../socket';

const DEFAULTS_SEC = {
  killCooldown: 20,
  taskHoldDuration: 20,
  deadTaskHoldDuration: 10,
  maxLockedRooms: 2,
  roomLockDuration: 20,
  roomLockCooldown: 60,
  globalLockdownDuration: 30,
  globalLockdownCooldown: 120,
  maxGlobalLockdowns: 2,
};

function toSec(ms) { return Math.round(ms / 1000); }
function toMs(sec) { return Math.round(parseFloat(sec) * 1000); }

function SettingsRow({ label, defaultLabel, children }) {
  return (
    <div className="settings-row">
      <div className="settings-label">
        {label}
        <span className="settings-sublabel">Default: {defaultLabel}</span>
      </div>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, min, max, unit = 's', disabled }) {
  if (disabled) {
    return <span className="settings-value">{value}{unit}</span>;
  }
  return (
    <div className="settings-input-group">
      <input
        className="settings-input"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      {unit && <span className="settings-unit">{unit}</span>}
    </div>
  );
}

function Toggle({ checked, onChange, disabled }) {
  if (disabled) {
    return <span className="settings-value">{checked ? 'On' : 'Off'}</span>;
  }
  return (
    <label className="settings-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      <span className="settings-toggle-track" />
    </label>
  );
}

export default function SettingsPanel({ isManager, settings, rooms, gameCode, onClose }) {
  const [local, setLocal] = useState({
    killCooldown: toSec(settings.killCooldown),
    taskHoldDuration: toSec(settings.taskHoldDuration),
    deadTaskHoldDuration: toSec(settings.deadTaskHoldDuration),
    sabotageEnabled: settings.sabotageEnabled,
    roomLockingEnabled: settings.roomLockingEnabled,
    maxLockedRooms: settings.maxLockedRooms,
    roomLockDuration: toSec(settings.roomLockDuration),
    roomLockCooldown: toSec(settings.roomLockCooldown),
    globalLockdownEnabled: settings.globalLockdownEnabled,
    globalLockdownDuration: toSec(settings.globalLockdownDuration),
    globalLockdownCooldown: toSec(settings.globalLockdownCooldown),
    maxGlobalLockdowns: settings.maxGlobalLockdowns,
  });

  const [saved, setSaved] = useState(false);
  const [localRooms, setLocalRooms] = useState([...rooms]);
  const roomsDebounceRef = useRef(null);
  const isMounted = useRef(false);

  // Sync local state when server confirms updated settings (skip initial mount)
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    setLocal({
      killCooldown: toSec(settings.killCooldown),
      taskHoldDuration: toSec(settings.taskHoldDuration),
      deadTaskHoldDuration: toSec(settings.deadTaskHoldDuration),
      sabotageEnabled: settings.sabotageEnabled,
      roomLockingEnabled: settings.roomLockingEnabled,
      maxLockedRooms: settings.maxLockedRooms,
      roomLockDuration: toSec(settings.roomLockDuration),
      roomLockCooldown: toSec(settings.roomLockCooldown),
      globalLockdownEnabled: settings.globalLockdownEnabled,
      globalLockdownDuration: toSec(settings.globalLockdownDuration),
      globalLockdownCooldown: toSec(settings.globalLockdownCooldown),
      maxGlobalLockdowns: settings.maxGlobalLockdowns,
    });
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(t);
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps

  function set(key, value) {
    setLocal(s => ({ ...s, [key]: value }));
  }

  const scheduleRoomsSave = useCallback((roomList) => {
    if (roomsDebounceRef.current) clearTimeout(roomsDebounceRef.current);
    roomsDebounceRef.current = setTimeout(() => {
      const valid = roomList.map(r => r.trim()).filter(r => r.length > 0);
      if (valid.length >= 2 && valid.length <= 10) {
        socket.emit('update_rooms', { code: gameCode, rooms: valid });
      }
    }, 400);
  }, [gameCode]);

  function setRoom(index, value) {
    const updated = [...localRooms];
    updated[index] = value;
    setLocalRooms(updated);
    scheduleRoomsSave(updated);
  }

  function addRoom() {
    if (localRooms.length < 10) {
      const updated = [...localRooms, ''];
      setLocalRooms(updated);
    }
  }

  function removeRoom(index) {
    if (localRooms.length <= 2) return;
    const updated = localRooms.filter((_, i) => i !== index);
    setLocalRooms(updated);
    scheduleRoomsSave(updated);
  }

  function handleSaveSettings() {
    socket.emit('update_settings', {
      code: gameCode,
      settings: {
        killCooldown: toMs(local.killCooldown),
        taskHoldDuration: toMs(local.taskHoldDuration),
        deadTaskHoldDuration: toMs(local.deadTaskHoldDuration),
        sabotageEnabled: local.sabotageEnabled,
        roomLockingEnabled: local.roomLockingEnabled,
        maxLockedRooms: parseInt(local.maxLockedRooms, 10),
        roomLockDuration: toMs(local.roomLockDuration),
        roomLockCooldown: toMs(local.roomLockCooldown),
        globalLockdownEnabled: local.globalLockdownEnabled,
        globalLockdownDuration: toMs(local.globalLockdownDuration),
        globalLockdownCooldown: toMs(local.globalLockdownCooldown),
        maxGlobalLockdowns: parseInt(local.maxGlobalLockdowns, 10),
      },
    });
  }

  const ro = !isManager; // read-only

  return (
    <Modal title={isManager ? 'Edit Settings' : 'Game Settings'} onClose={onClose}>
      <div className="settings-panel">

        {/* ── Timing ──────────────────────────────────────────────────── */}
        <div className="settings-section-title">Timing</div>

        <SettingsRow label="Kill cooldown" defaultLabel={`${DEFAULTS_SEC.killCooldown}s`}>
          <NumInput value={local.killCooldown} onChange={v => set('killCooldown', v)}
            min={5} max={120} disabled={ro} />
        </SettingsRow>

        <SettingsRow label="Task timer (alive)" defaultLabel={`${DEFAULTS_SEC.taskHoldDuration}s`}>
          <NumInput value={local.taskHoldDuration} onChange={v => set('taskHoldDuration', v)}
            min={5} max={60} disabled={ro} />
        </SettingsRow>

        <SettingsRow label="Task timer (dead)" defaultLabel={`${DEFAULTS_SEC.deadTaskHoldDuration}s`}>
          <NumInput value={local.deadTaskHoldDuration} onChange={v => set('deadTaskHoldDuration', v)}
            min={5} max={60} disabled={ro} />
        </SettingsRow>

        {/* ── Sabotage ────────────────────────────────────────────────── */}
        <div className="settings-section-title" style={{ marginTop: 20 }}>Sabotage</div>

        <SettingsRow label="Sabotage system enabled" defaultLabel="Off">
          <Toggle checked={local.sabotageEnabled} onChange={v => set('sabotageEnabled', v)} disabled={ro} />
        </SettingsRow>

        {local.sabotageEnabled && (
          <>
            <div className="settings-subsection-title">Room Locking</div>

            <SettingsRow label="Room locking enabled" defaultLabel="On">
              <Toggle checked={local.roomLockingEnabled} onChange={v => set('roomLockingEnabled', v)} disabled={ro} />
            </SettingsRow>

            {local.roomLockingEnabled && (
              <>
                <SettingsRow label="Max rooms locked at once" defaultLabel={String(DEFAULTS_SEC.maxLockedRooms)}>
                  <NumInput value={local.maxLockedRooms} onChange={v => set('maxLockedRooms', v)}
                    min={1} max={5} unit="" disabled={ro} />
                </SettingsRow>

                <SettingsRow label="Room lock duration" defaultLabel={`${DEFAULTS_SEC.roomLockDuration}s`}>
                  <NumInput value={local.roomLockDuration} onChange={v => set('roomLockDuration', v)}
                    min={5} max={120} disabled={ro} />
                </SettingsRow>

                <SettingsRow label="Room lock cooldown (per room)" defaultLabel={`${DEFAULTS_SEC.roomLockCooldown}s`}>
                  <NumInput value={local.roomLockCooldown} onChange={v => set('roomLockCooldown', v)}
                    min={10} max={300} disabled={ro} />
                </SettingsRow>
              </>
            )}

            <div className="settings-subsection-title">Global Lockdown</div>

            <SettingsRow label="Global lockdown enabled" defaultLabel="On">
              <Toggle checked={local.globalLockdownEnabled} onChange={v => set('globalLockdownEnabled', v)} disabled={ro} />
            </SettingsRow>

            {local.globalLockdownEnabled && (
              <>
                <SettingsRow label="Global lockdown duration" defaultLabel={`${DEFAULTS_SEC.globalLockdownDuration}s`}>
                  <NumInput value={local.globalLockdownDuration} onChange={v => set('globalLockdownDuration', v)}
                    min={10} max={120} disabled={ro} />
                </SettingsRow>

                <SettingsRow label="Global lockdown cooldown" defaultLabel={`${DEFAULTS_SEC.globalLockdownCooldown}s`}>
                  <NumInput value={local.globalLockdownCooldown} onChange={v => set('globalLockdownCooldown', v)}
                    min={30} max={600} disabled={ro} />
                </SettingsRow>

                <SettingsRow label="Max global lockdowns per game" defaultLabel={String(DEFAULTS_SEC.maxGlobalLockdowns)}>
                  <NumInput value={local.maxGlobalLockdowns} onChange={v => set('maxGlobalLockdowns', v)}
                    min={1} max={5} unit="" disabled={ro} />
                </SettingsRow>
              </>
            )}
          </>
        )}

        {isManager && (
          <button className="btn btn-blue btn-block settings-save-btn" onClick={handleSaveSettings} disabled={saved}>
            {saved ? 'Saved!' : 'Save Settings'}
          </button>
        )}

        {/* ── Rooms ───────────────────────────────────────────────────── */}
        <div className="settings-section-title" style={{ marginTop: 20 }}>Rooms</div>

        {isManager ? (
          <>
            {localRooms.map((room, i) => (
              <div key={i} className="room-row">
                <input
                  className="input"
                  placeholder={`Room ${i + 1}`}
                  value={room}
                  onChange={e => setRoom(i, e.target.value)}
                  maxLength={30}
                />
                {localRooms.length > 2 && (
                  <button type="button" className="btn-icon danger" onClick={() => removeRoom(i)}>✕</button>
                )}
              </div>
            ))}
            {localRooms.length < 10 && (
              <button type="button" className="btn btn-ghost btn-small" onClick={addRoom} style={{ marginTop: 8 }}>
                + Add Room
              </button>
            )}
            <p className="settings-sublabel" style={{ marginTop: 8, textAlign: 'center' }}>
              Room changes save automatically
            </p>
          </>
        ) : (
          <div className="room-list-preview">
            {rooms.map(r => (
              <div key={r} className="room-chip">{r}</div>
            ))}
          </div>
        )}

      </div>
    </Modal>
  );
}
