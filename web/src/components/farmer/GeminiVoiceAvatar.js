'use client'

export default function GeminiVoiceAvatar({ mode = 'idle' }) {
  const isTalking = mode === 'speaking'

  return (
    <div className="flex flex-col items-center gap-3" aria-live="polite">
      <div
        className={`gemini-voice-avatar ${isTalking ? 'gemini-voice-avatar-speaking' : ''}`}
        role="img"
        aria-label={isTalking ? 'AgroSaathi is speaking' : 'AgroSaathi voice advisor'}
      >
        <svg viewBox="0 0 180 190" className="h-40 w-40" aria-hidden="true">
          <ellipse cx="90" cy="181" rx="66" ry="15" fill="#dbeafe" />
          <path d="M37 179c3-34 20-52 53-52s50 18 53 52" fill="#176b4d" />
          <path d="M66 125h48v24c-9 12-39 12-48 0z" fill="#d89168" />
          <path d="M45 73c0-36 19-58 46-58s47 21 47 59v25c0 34-18 54-47 54S45 132 45 99z" fill="#f2bc94" />
          <path d="M44 76c-4-38 15-65 47-65 31 0 51 24 48 62-8-4-14-13-17-25-20 18-48 24-78 20z" fill="#26354a" />
          <path d="M44 65c-7 31-4 60 7 76-16-9-24-26-22-47 1-13 6-23 15-29zM137 64c8 28 5 59-7 77 17-11 24-30 20-50-2-12-6-21-13-27z" fill="#26354a" />
          <path d="M59 81c7-5 15-5 22 0" fill="none" stroke="#573d36" strokeWidth="3" strokeLinecap="round" />
          <path d="M99 81c7-5 15-5 22 0" fill="none" stroke="#573d36" strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="71" cy="91" rx="3.3" ry="4" fill="#26354a" />
          <ellipse cx="109" cy="91" rx="3.3" ry="4" fill="#26354a" />
          <path d="M89 91c-1 9-5 18-3 21 2 2 6 2 9 0" fill="none" stroke="#c27f5d" strokeWidth="2.5" strokeLinecap="round" />
          <ellipse cx="61" cy="106" rx="7" ry="4" fill="#e69f82" opacity=".55" />
          <ellipse cx="119" cy="106" rx="7" ry="4" fill="#e69f82" opacity=".55" />
          <g className="gemini-voice-avatar-mouth">
            <path d="M75 119c8 7 22 7 30 0" fill="none" stroke="#7e3d43" strokeWidth="4" strokeLinecap="round" />
            <ellipse cx="90" cy="121" rx="1" ry="1" fill="#f7d8c6" />
          </g>
          <path d="M24 179c8-22 23-34 45-38l21 19 21-19c22 4 37 16 45 38" fill="#23835f" />
          <path d="m69 142 21 18 21-18" fill="none" stroke="#e8f7ef" strokeWidth="3" />
        </svg>
      </div>
      <span className="text-xs font-semibold text-slate-500">
        {mode === 'listening' ? 'Listening' : mode === 'thinking' ? 'Thinking' : isTalking ? 'Speaking' : 'AgroSaathi'}
      </span>
    </div>
  )
}
