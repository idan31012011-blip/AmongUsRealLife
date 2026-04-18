import { useState } from 'react';
import { useGame } from '../context/GameContext';
import { useLanguage } from '../context/LanguageContext';
import socket from '../socket';
import { QRCodeSVG } from 'qrcode.react';
import SettingsPanel from '../components/SettingsPanel';

export default function LobbyScreen() {
  const { state } = useGame();
  const { t } = useLanguage();
  const { gameCode, players, isManager, myId, rooms, settings, stationAssignments } = state;
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [assignPlayerId, setAssignPlayerId] = useState('');
  const [assignRoomName, setAssignRoomName] = useState('');

  const activePlayers = players.filter(p => !p.disconnected);
  const canStart = activePlayers.length >= 3;

  function copyCode() {
    const url = `${window.location.origin}/?join=${gameCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      navigator.clipboard.writeText(gameCode).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    });
  }

  function startGame() {
    socket.emit('start_game', { code: gameCode });
  }

  function kickPlayer(playerId) {
    socket.emit('kick_player', { code: gameCode, targetId: playerId });
  }

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

  const stationPlayerIds = new Set((stationAssignments ?? []).map(s => s.playerId));
  const stationRoomNames = new Set((stationAssignments ?? []).map(s => s.roomName));
  const maxStations = activePlayers.length - 3;
  const canAddStation = isManager && settings.stationsEnabled && activePlayers.length >= 4 && (stationAssignments ?? []).length < maxStations;
  const availablePlayers = activePlayers.filter(p => !stationPlayerIds.has(p.id) && p.id !== myId);
  const availableRooms = rooms.filter(r => !stationRoomNames.has(r));

  const need = 3 - activePlayers.length;

  return (
    <div className="screen lobby-screen">
      <div className="lobby-header">
        <h2>{t('waitingRoom')}</h2>
        <div className="code-block" onClick={copyCode}>
          <span className="code-label">{t('gameCodeLabel')}</span>
          <span className="code-value">{gameCode}</span>
          <span className="code-hint">{copied ? t('copied') : t('tapToCopy')}</span>
        </div>

        {isManager && (
          <div className="qr-block">
            <p className="qr-label">{t('scanToJoin')}</p>
            <QRCodeSVG
              value={`${window.location.origin}/?join=${gameCode}`}
              size={160}
              bgColor="#ffffff"
              fgColor="#000000"
              level="M"
            />
          </div>
        )}

        <button
          className="btn btn-ghost btn-small lobby-settings-btn"
          onClick={() => setShowSettings(true)}
        >
          {isManager ? t('editSettings') : t('viewSettings')}
        </button>
      </div>

      <div className="lobby-rooms card">
        <span className="label">{t('roomsLabel')} </span>
        <span className="rooms-list">{rooms.join(' · ')}</span>
      </div>

      <div className="player-list-header">
        <span className="label">{t('playersLabel', activePlayers.length)}</span>
        <span className="label-dim">{t('need3ToStart')}</span>
      </div>

      <div className="player-list">
        {players.map(p => (
          <div key={p.id} className={`player-card ${p.disconnected ? 'disconnected' : ''} ${p.id === myId ? 'me' : ''}`}>
            <div className="player-dot" style={{ background: stringToColor(p.name) }} />
            <span className="player-name">
              {p.name}
              {p.id === myId && t('youSuffix')}
              {p.disconnected && ' 📵'}
            </span>
            {p.id === state.managerId && <span className="badge">{t('hostBadge')}</span>}
            {isManager && p.id !== myId && (
              <button
                className="btn-kick"
                onClick={() => kickPlayer(p.id)}
                title={`Kick ${p.name}`}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Station assignments panel */}
      {settings.stationsEnabled && activePlayers.length >= 4 && (
        <div className="station-assignment-panel card">
          <div className="station-panel-header">
            <span className="label">{t('stationAssignmentTitle')}</span>
            {isManager && <span className="label-dim">{t('maxStationsInfo', maxStations)}</span>}
          </div>

          {(stationAssignments ?? []).length === 0 && (
            <p className="station-no-assignments">{t('noStationsAssigned')}</p>
          )}

          {(stationAssignments ?? []).map(s => (
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

          {canAddStation && availablePlayers.length > 0 && availableRooms.length > 0 && (
            <div className="station-assign-form">
              <select
                className="input station-select"
                value={assignPlayerId}
                onChange={e => setAssignPlayerId(e.target.value)}
              >
                <option value="">{t('selectPlayerPlaceholder')}</option>
                {availablePlayers.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select
                className="input station-select"
                value={assignRoomName}
                onChange={e => setAssignRoomName(e.target.value)}
              >
                <option value="">{t('selectRoomPlaceholder')}</option>
                {availableRooms.map(r => (
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
      )}

      {isManager ? (
        <div className="lobby-footer">
          <button
            className={`btn btn-red btn-large ${!canStart ? 'disabled' : ''}`}
            onClick={startGame}
            disabled={!canStart}
          >
            {canStart ? t('startGame') : t('needMorePlayers', need)}
          </button>
        </div>
      ) : (
        <div className="lobby-footer">
          <p className="waiting-text">{t('waitingForHost')}</p>
        </div>
      )}

      {showSettings && (
        <SettingsPanel
          isManager={isManager}
          settings={settings}
          rooms={rooms}
          gameCode={gameCode}
          onClose={() => setShowSettings(false)}
          playerCount={activePlayers.length}
        />
      )}
    </div>
  );
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 65%, 55%)`;
}
