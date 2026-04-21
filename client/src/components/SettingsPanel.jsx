import { useState, useRef, useCallback, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
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
  criticalCountdownDuration: 40,
  criticalCountdownCooldown: 30,
  maxCriticalCountdowns: 1,
  fileReadingTimerDuration: 90,
  fileReadingPenaltyCooldown: 30,
};

function toSec(ms) { return Math.round(ms / 1000); }
function toMs(sec) { return Math.round(parseFloat(sec) * 1000); }

function SettingsRow({ label, defaultLabel, children }) {
  return (
    <div className="settings-row">
      <div className="settings-label">
        {label}
        <span className="settings-sublabel">{defaultLabel}</span>
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
  const { t } = useLanguage();
  if (disabled) {
    return <span className="settings-value">{checked ? t('defaultOn') : t('defaultOff')}</span>;
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

export default function SettingsPanel({ isManager, settings, rooms, gameCode, onClose, playerCount, stationAssignments, activePlayers, myId }) {
  const { t } = useLanguage();
  const [assignPlayerId, setAssignPlayerId] = useState('');
  const [assignRoomName, setAssignRoomName] = useState('');

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
    stationsEnabled: settings.stationsEnabled ?? false,
    stationMiniGames: settings.stationMiniGames ?? ['simon', 'stopbar', 'wireconnect'],
    doctorEnabled: settings.doctorEnabled ?? false,
    criticalCountdownEnabled: settings.criticalCountdownEnabled ?? false,
    criticalCountdownDuration: toSec(settings.criticalCountdownDuration ?? 40000),
    criticalCountdownCooldown: toSec(settings.criticalCountdownCooldown ?? 30000),
    maxCriticalCountdowns: settings.maxCriticalCountdowns ?? 1,
    criticalCountdownStation: settings.criticalCountdownStation ?? null,
    fileReadingEnabled: settings.fileReadingEnabled ?? false,
    fileReadingTimerDuration: toSec(settings.fileReadingTimerDuration ?? 90000),
    fileReadingPenaltyCooldown: toSec(settings.fileReadingPenaltyCooldown ?? 30000),
  });

  const [saved, setSaved] = useState(false);
  const [localRooms, setLocalRooms] = useState([...rooms]);
  const roomsDebounceRef = useRef(null);
  const isMounted = useRef(false);

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
      stationsEnabled: settings.stationsEnabled ?? false,
      stationMiniGames: settings.stationMiniGames ?? ['simon', 'stopbar', 'wireconnect'],
      doctorEnabled: settings.doctorEnabled ?? false,
      criticalCountdownEnabled: settings.criticalCountdownEnabled ?? false,
      criticalCountdownDuration: toSec(settings.criticalCountdownDuration ?? 40000),
      criticalCountdownCooldown: toSec(settings.criticalCountdownCooldown ?? 30000),
      maxCriticalCountdowns: settings.maxCriticalCountdowns ?? 1,
      criticalCountdownStation: settings.criticalCountdownStation ?? null,
      fileReadingEnabled: settings.fileReadingEnabled ?? false,
      fileReadingTimerDuration: toSec(settings.fileReadingTimerDuration ?? 90000),
      fileReadingPenaltyCooldown: toSec(settings.fileReadingPenaltyCooldown ?? 30000),
    });
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(timer);
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
        stationsEnabled: local.stationsEnabled,
        stationMiniGames: local.stationMiniGames,
        doctorEnabled: local.doctorEnabled,
        criticalCountdownEnabled: local.criticalCountdownEnabled,
        criticalCountdownDuration: toMs(local.criticalCountdownDuration),
        criticalCountdownCooldown: toMs(local.criticalCountdownCooldown),
        maxCriticalCountdowns: parseInt(local.maxCriticalCountdowns, 10),
        criticalCountdownStation: local.criticalCountdownStation || null,
        fileReadingEnabled: local.fileReadingEnabled,
        fileReadingTimerDuration: toMs(local.fileReadingTimerDuration),
        fileReadingPenaltyCooldown: toMs(local.fileReadingPenaltyCooldown),
      },
    });
  }

  const ro = !isManager;

  return (
    <Modal title={isManager ? t('settingsEditTitle') : t('settingsViewTitle')} onClose={onClose}>
      <div className="settings-panel">

        {/* ── Timing ──────────────────────────────────────────────────── */}
        <div className="settings-section-title">{t('settingsTiming')}</div>

        <SettingsRow label={t('killCooldownLabel')} defaultLabel={t('defaultPrefix', `${DEFAULTS_SEC.killCooldown}s`)}>
          <NumInput value={local.killCooldown} onChange={v => set('killCooldown', v)}
            min={5} max={120} disabled={ro} />
        </SettingsRow>

        <SettingsRow label={t('taskTimerAlive')} defaultLabel={t('defaultPrefix', `${DEFAULTS_SEC.taskHoldDuration}s`)}>
          <NumInput value={local.taskHoldDuration} onChange={v => set('taskHoldDuration', v)}
            min={5} max={60} disabled={ro} />
        </SettingsRow>

        <SettingsRow label={t('taskTimerDead')} defaultLabel={t('defaultPrefix', `${DEFAULTS_SEC.deadTaskHoldDuration}s`)}>
          <NumInput value={local.deadTaskHoldDuration} onChange={v => set('deadTaskHoldDuration', v)}
            min={5} max={60} disabled={ro} />
        </SettingsRow>

        {/* ── Sabotage ────────────────────────────────────────────────── */}
        <div className="settings-section-title" style={{ marginTop: 20 }}>{t('settingsSabotage')}</div>

        <SettingsRow label={t('sabotageEnabledLabel')} defaultLabel={t('defaultPrefix', t('defaultOff'))}>
          <Toggle checked={local.sabotageEnabled} onChange={v => set('sabotageEnabled', v)} disabled={ro} />
        </SettingsRow>

        {local.sabotageEnabled && (
          <>
            <div className="settings-subsection-title">{t('roomLockingLabel')}</div>

            <SettingsRow label={t('roomLockingEnabledLabel')} defaultLabel={t('defaultPrefix', t('defaultOn'))}>
              <Toggle checked={local.roomLockingEnabled} onChange={v => set('roomLockingEnabled', v)} disabled={ro} />
            </SettingsRow>

            {local.roomLockingEnabled && (
              <>
                <SettingsRow label={t('maxLockedRoomsLabel')} defaultLabel={t('defaultPrefix', String(DEFAULTS_SEC.maxLockedRooms))}>
                  <NumInput value={local.maxLockedRooms} onChange={v => set('maxLockedRooms', v)}
                    min={1} max={5} unit="" disabled={ro} />
                </SettingsRow>

                <SettingsRow label={t('roomLockDurationLabel')} defaultLabel={t('defaultPrefix', `${DEFAULTS_SEC.roomLockDuration}s`)}>
                  <NumInput value={local.roomLockDuration} onChange={v => set('roomLockDuration', v)}
                    min={5} max={120} disabled={ro} />
                </SettingsRow>

                <SettingsRow label={t('roomLockCooldownLabel')} defaultLabel={t('defaultPrefix', `${DEFAULTS_SEC.roomLockCooldown}s`)}>
                  <NumInput value={local.roomLockCooldown} onChange={v => set('roomLockCooldown', v)}
                    min={10} max={300} disabled={ro} />
                </SettingsRow>
              </>
            )}

            <div className="settings-subsection-title">{t('globalLockdownLabel')}</div>

            <SettingsRow label={t('globalLockdownEnabledLabel')} defaultLabel={t('defaultPrefix', t('defaultOn'))}>
              <Toggle checked={local.globalLockdownEnabled} onChange={v => set('globalLockdownEnabled', v)} disabled={ro} />
            </SettingsRow>

            {local.globalLockdownEnabled && (
              <>
                <SettingsRow label={t('globalLockdownDurationLabel')} defaultLabel={t('defaultPrefix', `${DEFAULTS_SEC.globalLockdownDuration}s`)}>
                  <NumInput value={local.globalLockdownDuration} onChange={v => set('globalLockdownDuration', v)}
                    min={10} max={120} disabled={ro} />
                </SettingsRow>

                <SettingsRow label={t('globalLockdownCooldownLabel')} defaultLabel={t('defaultPrefix', `${DEFAULTS_SEC.globalLockdownCooldown}s`)}>
                  <NumInput value={local.globalLockdownCooldown} onChange={v => set('globalLockdownCooldown', v)}
                    min={30} max={600} disabled={ro} />
                </SettingsRow>

                <SettingsRow label={t('maxGlobalLockdownsLabel')} defaultLabel={t('defaultPrefix', String(DEFAULTS_SEC.maxGlobalLockdowns))}>
                  <NumInput value={local.maxGlobalLockdowns} onChange={v => set('maxGlobalLockdowns', v)}
                    min={1} max={5} unit="" disabled={ro} />
                </SettingsRow>
              </>
            )}

            <div className="settings-subsection-title">{t('settingsCriticalCountdown')}</div>

            {(() => {
              const assignedStations = stationAssignments ?? [];
              const hasStations = local.stationsEnabled && assignedStations.length > 0;
              const multiStation = assignedStations.length >= 2;
              return (
                <>
                  <SettingsRow
                    label={t('criticalCountdownEnabledLabel')}
                    defaultLabel={t('defaultPrefix', t('defaultOff'))}
                  >
                    <Toggle
                      checked={local.criticalCountdownEnabled}
                      onChange={v => set('criticalCountdownEnabled', v)}
                      disabled={ro || !hasStations}
                    />
                  </SettingsRow>
                  {!ro && !hasStations && (
                    <p className="settings-sublabel" style={{ marginTop: 4, textAlign: 'right', color: 'var(--color-text-dim)' }}>
                      {t('criticalCountdownRequiresStations')}
                    </p>
                  )}
                  {local.criticalCountdownEnabled && hasStations && (
                    <>
                      <SettingsRow label={t('criticalCountdownDurationLabel')} defaultLabel={t('defaultPrefix', `${DEFAULTS_SEC.criticalCountdownDuration}s`)}>
                        <NumInput value={local.criticalCountdownDuration} onChange={v => set('criticalCountdownDuration', v)}
                          min={10} max={120} disabled={ro} />
                      </SettingsRow>
                      <SettingsRow label={t('criticalCountdownCooldownLabel')} defaultLabel={t('defaultPrefix', `${DEFAULTS_SEC.criticalCountdownCooldown}s`)}>
                        <NumInput value={local.criticalCountdownCooldown} onChange={v => set('criticalCountdownCooldown', v)}
                          min={10} max={300} disabled={ro} />
                      </SettingsRow>
                      <SettingsRow label={t('maxCriticalCountdownsLabel')} defaultLabel={t('defaultPrefix', String(DEFAULTS_SEC.maxCriticalCountdowns))}>
                        <NumInput value={local.maxCriticalCountdowns} onChange={v => set('maxCriticalCountdowns', v)}
                          min={1} max={5} unit="" disabled={ro} />
                      </SettingsRow>
                      {multiStation && (
                        <SettingsRow label={t('criticalCountdownStationLabel')} defaultLabel="">
                          {ro ? (
                            <span className="settings-value">{local.criticalCountdownStation || t('criticalCountdownStationAuto')}</span>
                          ) : (
                            <select
                              className="settings-input"
                              value={local.criticalCountdownStation || ''}
                              onChange={e => set('criticalCountdownStation', e.target.value || null)}
                              style={{ fontSize: 13 }}
                            >
                              <option value="">{t('criticalCountdownStationSelect')}</option>
                              {assignedStations.map(s => (
                                <option key={s.roomName} value={s.roomName}>{s.roomName}</option>
                              ))}
                            </select>
                          )}
                        </SettingsRow>
                      )}
                    </>
                  )}
                </>
              );
            })()}

          </>
        )}

        {/* ── Stations ────────────────────────────────────────────────── */}
        <div className="settings-section-title" style={{ marginTop: 20 }}>{t('settingsStations')}</div>

        <SettingsRow label={t('stationsEnabledLabel')} defaultLabel={t('defaultPrefix', t('defaultOff'))}>
          <Toggle
            checked={local.stationsEnabled}
            onChange={v => set('stationsEnabled', v)}
            disabled={ro || (playerCount ?? 0) < 4}
          />
        </SettingsRow>
        {!ro && (playerCount ?? 0) < 4 && (
          <p className="settings-sublabel" style={{ marginTop: 4, textAlign: 'right', color: 'var(--color-text-dim)' }}>
            {t('stationsNeedPlayers')}
          </p>
        )}

        {local.stationsEnabled && (
          <div className="mini-games-row">
            <span className="settings-label">{t('stationMiniGamesLabel')}</span>
            <div className="mini-games-list">
              {[
                { key: 'simon',       label: t('miniGameSimon') },
                { key: 'stopbar',     label: t('miniGameStopBar') },
                { key: 'wireconnect', label: t('miniGameWireConnect') },
              ].map(({ key, label }) => {
                const isOn   = local.stationMiniGames.includes(key);
                const isOnly = local.stationMiniGames.length === 1 && isOn;
                return (
                  <label key={key} className="mini-game-check">
                    <input
                      type="checkbox"
                      checked={isOn}
                      disabled={ro || isOnly}
                      onChange={() => {
                        if (!isOn) {
                          set('stationMiniGames', [...local.stationMiniGames, key]);
                        } else if (!isOnly) {
                          set('stationMiniGames', local.stationMiniGames.filter(g => g !== key));
                        }
                      }}
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {settings.stationsEnabled && (activePlayers ?? []).length >= 4 && (() => {
          const assignments = stationAssignments ?? [];
          const stationPlayerIds = new Set(assignments.map(s => s.playerId));
          const stationRoomNames = new Set(assignments.map(s => s.roomName));
          const maxStations = (activePlayers ?? []).length - 3;
          const canAdd = isManager && assignments.length < maxStations;
          const availPlayers = (activePlayers ?? []).filter(p => !stationPlayerIds.has(p.id) && p.id !== myId);
          const availRooms = rooms.filter(r => !stationRoomNames.has(r));

          function assignStation() {
            if (!assignPlayerId || !assignRoomName) return;
            socket.emit('assign_station', { code: gameCode, playerId: assignPlayerId, roomName: assignRoomName });
            setAssignPlayerId('');
            setAssignRoomName('');
          }
          function unassignStation(playerId) {
            socket.emit('unassign_station', { code: gameCode, playerId });
          }
          function toggleStationMeeting(playerId, hasMeeting) {
            socket.emit('set_station_meeting', { code: gameCode, playerId, hasMeeting });
          }

          return (
            <div className="station-assignment-panel" style={{ marginTop: 12 }}>
              <div className="station-panel-header">
                <span className="label">{t('stationAssignmentTitle')}</span>
                {isManager && <span className="label-dim">{t('maxStationsInfo', maxStations)}</span>}
              </div>

              {assignments.length === 0 && (
                <p className="station-no-assignments">{t('noStationsAssigned')}</p>
              )}

              {assignments.map(s => (
                <div key={s.playerId} className="station-assignment-row">
                  <span className="station-assignment-name">{s.playerName}</span>
                  <span className="badge">{s.roomName}</span>
                  {isManager ? (
                    <>
                      <span className="station-meeting-emoji" title={t('stationMeetingToggleLabel')}>🚨</span>
                      <label className="settings-toggle">
                        <input
                          type="checkbox"
                          checked={s.hasMeeting ?? false}
                          onChange={e => toggleStationMeeting(s.playerId, e.target.checked)}
                        />
                        <span className="settings-toggle-track" />
                      </label>
                      <button className="btn-kick" onClick={() => unassignStation(s.playerId)}>✕</button>
                    </>
                  ) : (
                    s.hasMeeting && <span className="badge">🚨</span>
                  )}
                </div>
              ))}

              {canAdd && availPlayers.length > 0 && availRooms.length > 0 && (
                <div className="station-assign-form">
                  <select
                    className="input station-select"
                    value={assignPlayerId}
                    onChange={e => setAssignPlayerId(e.target.value)}
                  >
                    <option value="">{t('selectPlayerPlaceholder')}</option>
                    {availPlayers.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <select
                    className="input station-select"
                    value={assignRoomName}
                    onChange={e => setAssignRoomName(e.target.value)}
                  >
                    <option value="">{t('selectRoomPlaceholder')}</option>
                    {availRooms.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <button
                    className="btn btn-blue btn-small"
                    onClick={assignStation}
                    disabled={!assignPlayerId || !assignRoomName}
                  >
                    {t('assignStationBtn')}
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Doctor ──────────────────────────────────────────────────── */}
        <div className="settings-section-title" style={{ marginTop: 20 }}>{t('settingsDoctor')}</div>

        <SettingsRow label={t('doctorEnabledLabel')} defaultLabel={t('defaultPrefix', t('defaultOff'))}>
          <Toggle checked={local.doctorEnabled} onChange={v => set('doctorEnabled', v)} disabled={ro} />
        </SettingsRow>

        {/* ── File Reading ────────────────────────────────────────────── */}
        <div className="settings-section-title" style={{ marginTop: 20 }}>{t('settingsFileReading')}</div>

        <SettingsRow label={t('fileReadingEnabledLabel')} defaultLabel={t('defaultPrefix', t('defaultOff'))}>
          <Toggle checked={local.fileReadingEnabled} onChange={v => set('fileReadingEnabled', v)} disabled={ro} />
        </SettingsRow>

        {local.fileReadingEnabled && (
          <>
            <SettingsRow label={t('fileReadingTimerLabel')} defaultLabel={t('defaultPrefix', `${DEFAULTS_SEC.fileReadingTimerDuration}s`)}>
              <NumInput value={local.fileReadingTimerDuration} onChange={v => set('fileReadingTimerDuration', v)}
                min={15} max={300} disabled={ro} />
            </SettingsRow>
            <SettingsRow label={t('fileReadingPenaltyLabel')} defaultLabel={t('defaultPrefix', `${DEFAULTS_SEC.fileReadingPenaltyCooldown}s`)}>
              <NumInput value={local.fileReadingPenaltyCooldown} onChange={v => set('fileReadingPenaltyCooldown', v)}
                min={5} max={120} disabled={ro} />
            </SettingsRow>
          </>
        )}

        {isManager && (
          <button className="btn btn-blue btn-block settings-save-btn" onClick={handleSaveSettings} disabled={saved}>
            {saved ? t('savedSettings') : t('saveSettings')}
          </button>
        )}

        {/* ── Rooms ───────────────────────────────────────────────────── */}
        <div className="settings-section-title" style={{ marginTop: 20 }}>{t('settingsRoomsSection')}</div>

        {isManager ? (
          <>
            {localRooms.map((room, i) => (
              <div key={i} className="room-row">
                <input
                  className="input"
                  placeholder={t('settingsRoomPlaceholder', i + 1)}
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
                {t('settingsAddRoom')}
              </button>
            )}
            <p className="settings-sublabel" style={{ marginTop: 8, textAlign: 'center' }}>
              {t('roomsAutoSave')}
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
