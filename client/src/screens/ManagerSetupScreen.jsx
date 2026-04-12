import { useState } from 'react';
import { useGame } from '../context/GameContext';
import socket from '../socket';

const DEFAULT_ROOMS = ['Kitchen', 'Living Room', 'Bedroom', 'Garage'];

export default function ManagerSetupScreen() {
  const { dispatch } = useGame();
  const [rooms, setRooms] = useState(['', '', '']);
  const [managerName, setManagerName] = useState('');
  const [useDefaults, setUseDefaults] = useState(false);

  function setRoom(index, value) {
    const updated = [...rooms];
    updated[index] = value;
    setRooms(updated);
  }

  function addRoom() {
    if (rooms.length < 10) setRooms([...rooms, '']);
  }

  function removeRoom(index) {
    if (rooms.length <= 2) return;
    setRooms(rooms.filter((_, i) => i !== index));
  }

  function handleCreate(e) {
    e.preventDefault();
    const finalRooms = useDefaults
      ? DEFAULT_ROOMS
      : rooms.map(r => r.trim()).filter(r => r.length > 0);

    if (finalRooms.length < 2) {
      alert('Enter at least 2 room names.');
      return;
    }
    if (!managerName.trim()) {
      alert('Enter your name.');
      return;
    }

    const name = managerName.trim();
    localStorage.setItem('playerName', name);
    dispatch({ type: 'SET_MY_NAME', name });

    socket.emit('create_game', { rooms: finalRooms });
    // After game is created, server sends game_created → GAME_CREATED dispatch
    // Then manager needs to join their own game
    socket.once('game_created', ({ code }) => {
      localStorage.setItem('gameCode', code);
      socket.emit('join_game', { code, name });
    });
  }

  return (
    <div className="screen scrollable-screen">
      <div className="screen-header">
        <button className="btn-icon" onClick={() => dispatch({ type: 'RESET_TO_HOME' })}>←</button>
        <h2>Create Game</h2>
      </div>

      <form className="setup-form" onSubmit={handleCreate}>
        <div className="card">
          <label className="label">Your Name</label>
          <input
            className="input"
            placeholder="Enter your name"
            value={managerName}
            onChange={e => setManagerName(e.target.value)}
            maxLength={20}
            autoComplete="off"
          />
        </div>

        <div className="card">
          <div className="section-header">
            <label className="label">Room Names</label>
            <button
              type="button"
              className="btn-text"
              onClick={() => setUseDefaults(d => !d)}
            >
              {useDefaults ? 'Custom' : 'Use Defaults'}
            </button>
          </div>

          {useDefaults ? (
            <div className="room-list-preview">
              {DEFAULT_ROOMS.map(r => (
                <div key={r} className="room-chip">{r}</div>
              ))}
            </div>
          ) : (
            <>
              {rooms.map((room, i) => (
                <div key={i} className="room-row">
                  <input
                    className="input"
                    placeholder={`Room ${i + 1}`}
                    value={room}
                    onChange={e => setRoom(i, e.target.value)}
                    maxLength={30}
                  />
                  {rooms.length > 2 && (
                    <button type="button" className="btn-icon danger" onClick={() => removeRoom(i)}>✕</button>
                  )}
                </div>
              ))}
              {rooms.length < 10 && (
                <button type="button" className="btn btn-ghost btn-small" onClick={addRoom}>
                  + Add Room
                </button>
              )}
            </>
          )}
        </div>

        <button className="btn btn-red btn-large" type="submit">
          Create Game
        </button>
      </form>
    </div>
  );
}
