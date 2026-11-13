import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';
import { errMsg, useLiveTokenMutation } from '../api';
import { Alert } from '../components/ui.jsx';

// The server gives us a short-lived token; LiveKit Cloud handles video, audio and the built-in chat.
export default function LiveRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [getToken, { data, error, isLoading }] = useLiveTokenMutation();
  const asked = useRef(false);
  useEffect(() => { if (!asked.current) { asked.current = true; getToken(id); } }, [id, getToken]);

  if (isLoading || (!data && !error)) return <p className="muted">Joining the class…</p>;
  if (error) return <Alert>{errMsg(error)}</Alert>;

  return (
    <div className="lk" data-lk-theme="default">
      <LiveKitRoom serverUrl={data.url} token={data.token} connect video={data.host} audio={data.host} onDisconnected={() => navigate(-1)}>
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}
