import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  BlackjackClientMessageType,
  type Card,
  type Hand,
  type BlackjackServerState,
  type Player,
  GameState,
} from "../../../shared/types"
import { useGameStore } from "../../store/gameStore"
import { GameHeader } from "../GameHeader"
import { LobbyGameSettingsBadges } from "../LobbyGameSettingsBadges"
import { PlayerCard } from "../PlayerCard"

interface BlackjackViewProps {
  state: BlackjackServerState
  players: Player[]
  selfId: string
  gameState: GameState
  isAdmin: boolean
  room: string
  password?: string | null
  onOpenSettings: () => void
  onKick: (playerId: string) => void
  onEditName: () => void
}

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
}

const SUIT_COLORS: Record<string, string> = {
  hearts: "text-red-500",
  diamonds: "text-red-500",
  clubs: "text-gray-800",
  spades: "text-gray-800",
}

const CardComponent: React.FC<{ card: Card; hidden?: boolean }> = ({
  card,
  hidden,
}) => {
  if (hidden) {
    return (
      <motion.div
        initial={{ rotateY: 180, opacity: 0 }}
        animate={{ rotateY: 0, opacity: 1 }}
        className="w-16 h-24 bg-blue-600 rounded-lg border-2 border-white shadow-md flex items-center justify-center"
      >
        <div className="w-12 h-20 border border-white/20 rounded flex items-center justify-center">
          <span className="text-white text-2xl">?</span>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ scale: 0.5, opacity: 0, y: -20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      className="w-16 h-24 bg-white rounded-lg border border-gray-300 shadow-md flex flex-col p-1 relative overflow-hidden"
    >
      <div className={`text-sm font-bold self-start ${SUIT_COLORS[card.suit]}`}>
        {card.rank}
      </div>
      <div className={`text-xl self-center my-auto ${SUIT_COLORS[card.suit]}`}>
        {SUIT_SYMBOLS[card.suit]}
      </div>
      <div
        className={`text-sm font-bold self-end rotate-180 ${SUIT_COLORS[card.suit]}`}
      >
        {card.rank}
      </div>
    </motion.div>
  )
}

const HandComponent: React.FC<{
  hand: Hand
  label: string
  isActive?: boolean
  showAllCards?: boolean
}> = ({ hand, label, isActive, showAllCards = true }) => {
  return (
    <div
      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
        isActive
          ? "border-yellow-400 bg-yellow-400/10 scale-105 shadow-lg"
          : "border-transparent bg-white/5"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold opacity-70 uppercase tracking-wider">
          {label}
        </span>
        {hand.score > 0 && showAllCards && (
          <span
            className={`px-2 py-0.5 rounded text-xs font-bold ${
              hand.isBusted
                ? "bg-red-500 text-white"
                : "bg-green-500 text-white"
            }`}
          >
            {hand.score}
          </span>
        )}
      </div>
      <div className="flex -space-x-4">
        <AnimatePresence>
          {hand.cards.map((card, idx) => (
            <CardComponent
              key={`${idx}-${card.suit}-${card.rank}`}
              card={card}
              hidden={!showAllCards && idx === 1}
            />
          ))}
        </AnimatePresence>
      </div>
      {hand.status && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className={`text-xs font-black uppercase px-2 py-1 rounded shadow-sm ${
            hand.status === "won"
              ? "bg-green-500 text-white"
              : hand.status === "lost"
                ? "bg-red-500 text-white"
                : hand.status === "push"
                  ? "bg-gray-500 text-white"
                  : hand.status === "blackjack"
                    ? "bg-yellow-500 text-black"
                    : "bg-blue-500 text-white"
          }`}
        >
          {hand.status}
        </motion.div>
      )}
    </div>
  )
}

export const BlackjackView: React.FC<BlackjackViewProps> = ({
  state,
  players,
  selfId,
  gameState,
  isAdmin,
  room,
  password,
  onOpenSettings,
  onKick,
  onEditName,
}) => {
  const socket = useGameStore((state) => state.socket)

  const showDealerCards =
    state.roundStatus === "dealer_turn" || state.roundStatus === "round_results"

  const selfState = state?.playersState?.[selfId]
  const isActivePlayer = state?.activePlayerId === selfId

  const [betAmount, setBetAmount] = React.useState(25)

  React.useEffect(() => {
    if (state?.roundStatus === "betting") {
      setBetAmount(25)
    }
  }, [state?.roundStatus])

  const handlePlaceBet = () => {
    socket?.send(
      JSON.stringify({
        type: BlackjackClientMessageType.PLACE_BET,
        amount: betAmount,
      }),
    )
  }

  const handleAction = (type: BlackjackClientMessageType) => {
    socket?.send(JSON.stringify({ type }))
  }

  if (!state || !state.playersState) {
    return (
      <div className="flex flex-col items-center justify-center p-12 opacity-50">
        <div className="loading loading-spinner loading-lg mb-4"></div>
        <div className="text-xl font-bold uppercase tracking-widest">
          Waiting for Dealer...
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto p-4">
      <GameHeader
        room={room}
        password={password}
        isAdmin={isAdmin}
        gameState={gameState}
        onOpenSettings={onOpenSettings}
      >
        <div className="flex flex-col gap-8 pb-4">
          {/* Dealer Area */}
          {(gameState === GameState.PLAYING ||
            gameState === GameState.ENDED) && (
            <div className="flex justify-center">
              <HandComponent
                hand={state.dealerHand}
                label={"Dealer"}
                showAllCards={showDealerCards}
              />
            </div>
          )}

          {/* Timer Area */}
          {gameState === GameState.PLAYING &&
            state.roundStatus === "players_turn" &&
            state.activePlayerId && (
              <div className="w-full max-w-md mx-auto">
                <div className="flex justify-between text-xs font-bold opacity-70 mb-1 uppercase tracking-wider">
                  <span>
                    {players.find((p) => p.id === state.activePlayerId)?.name}'s
                    Turn
                  </span>
                  <span>{state.timer}s</span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    initial={false}
                    animate={{
                      width: `${(state.timer / state.maxTimer) * 100}%`,
                    }}
                    transition={{ duration: 1, ease: "linear" }}
                    className={`h-full ${
                      state.timer < 10 ? "bg-red-500" : "bg-blue-500"
                    }`}
                  />
                </div>
              </div>
            )}

          {/* Betting Phase Timer */}
          {gameState === GameState.PLAYING &&
            state.roundStatus === "betting" &&
            state.bettingTimer !== null && (
              <div className="w-full max-w-md mx-auto">
                <div className="flex justify-between text-xs font-bold opacity-70 mb-1 uppercase tracking-wider">
                  <span>Place your bets!</span>
                  <span>{state.bettingTimer}s</span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    initial={false}
                    animate={{
                      width: `${(state.bettingTimer / 30) * 100}%`,
                    }}
                    transition={{ duration: 1, ease: "linear" }}
                    className="h-full bg-yellow-500"
                  />
                </div>
              </div>
            )}
          <AnimatePresence>
            {isActivePlayer && state.roundStatus === "players_turn" && (
              <motion.div
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 50, opacity: 0 }}
                className="flex gap-4 bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-white/20 shadow-2xl justify-center"
              >
                <button
                  onClick={() => handleAction(BlackjackClientMessageType.HIT)}
                  className="btn btn-primary"
                >
                  HIT
                </button>
                <button
                  onClick={() => handleAction(BlackjackClientMessageType.STAND)}
                  className="btn btn-warning"
                >
                  STAND
                </button>
                {selfState?.hands?.[selfState.activeHandIndex]?.cards
                  ?.length === 2 &&
                  selfState.bankroll >=
                    selfState.hands[selfState.activeHandIndex].bet && (
                    <>
                      <button
                        onClick={() =>
                          handleAction(BlackjackClientMessageType.DOUBLE)
                        }
                        className="btn btn-warning"
                      >
                        DOUBLE
                      </button>
                      {selfState.hands[selfState.activeHandIndex].cards[0]
                        .rank ===
                        selfState.hands[selfState.activeHandIndex].cards[1]
                          .rank && (
                        <button
                          onClick={() =>
                            handleAction(BlackjackClientMessageType.SPLIT)
                          }
                          className="btn btn-secondary"
                        >
                          SPLIT
                        </button>
                      )}
                    </>
                  )}
              </motion.div>
            )}

            {/* Betting Controls Overlay */}
            {gameState === GameState.PLAYING &&
              state.roundStatus === "betting" &&
              selfState &&
              selfState.bankroll > 0 &&
              (!selfState.hands?.length ||
                selfState.hands[0].status === "playing") && (
                <motion.div
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 50, opacity: 0 }}
                  className="flex flex-col items-center gap-4 bg-black/40 backdrop-blur-md p-6 rounded-2xl border border-white/20 shadow-2xl z-50 w-full max-w-sm mx-auto"
                >
                  <div className="text-xl font-bold text-white uppercase tracking-wider">
                    Set Your Bet
                  </div>
                  <div className="flex flex-col items-center gap-2 w-full">
                    <div className="flex justify-between w-full text-xs font-bold opacity-60 px-1">
                      <span>$25</span>
                      <span className="text-yellow-500 font-black text-lg">
                        ${betAmount}
                      </span>
                      <span>${selfState?.bankroll || 1000}</span>
                    </div>
                    <input
                      type="range"
                      min="25"
                      max={selfState?.bankroll || 1000}
                      step="25"
                      value={betAmount}
                      onChange={(e) => setBetAmount(parseInt(e.target.value))}
                      className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                    />
                  </div>

                  <button
                    onClick={() => setBetAmount(selfState?.bankroll || 25)}
                    className="btn btn-warning"
                  >
                    Max bet
                  </button>

                  <button onClick={handlePlaceBet} className="btn btn-primary">
                    Place bet
                  </button>
                </motion.div>
              )}
          </AnimatePresence>

          {/* Lobby / Start Game */}
          <div className="flex flex-col items-center gap-4">
            {state.roundStatus === "betting" &&
              gameState === GameState.LOBBY && (
                <>
                  <h2 className="text-2xl font-bold">Blackjack</h2>
                  <p className="opacity-70 max-w-md text-center">
                    Beat the dealer by getting as close to 21 as possible
                    without going over!
                  </p>
                  <LobbyGameSettingsBadges
                    settings={[
                      `Goal: $${state.winningScore}`,
                      `Decks: ${state.deckCount}`,
                      `Turn Timer: ${state.maxTimer}s`,
                      `Dealer hits soft 17: ${state.dealerHitsSoft17 ? "Yes" : "No"}`,
                    ]}
                  />
                  {isAdmin ? (
                    <button
                      onClick={() =>
                        handleAction(BlackjackClientMessageType.START_GAME)
                      }
                      className="btn btn-primary"
                    >
                      Start game
                    </button>
                  ) : (
                    <div className="mt-4 opacity-70">
                      Waiting for the admin to start...
                    </div>
                  )}
                </>
              )}

            {isAdmin &&
              (gameState === GameState.PLAYING ||
                gameState === GameState.COUNTDOWN) && (
                <button
                  onClick={() =>
                    handleAction(BlackjackClientMessageType.STOP_GAME)
                  }
                  className="btn btn-warning"
                >
                  Stop Game
                </button>
              )}

            {gameState === GameState.ENDED && (
              <>
                <div className="text-xl font-bold mt-4">Game Over</div>
                {state.winnerIds && state.winnerIds.length > 0 && (
                  <div className="text-2xl font-black text-yellow-500 my-4 text-center">
                    {state.winnerIds
                      .map(
                        (id) =>
                          players.find((p) => p.id === id)?.name || "A player",
                      )
                      .join(" and ")}{" "}
                    {state.winnerIds.length > 1 ? "win" : "wins"} with $
                    {state.playersState[state.winnerIds[0]]?.bankroll}!
                  </div>
                )}
                {isAdmin && (
                  <button
                    onClick={() =>
                      handleAction(BlackjackClientMessageType.RESET_GAME)
                    }
                    className="btn btn-primary"
                  >
                    Play Again
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </GameHeader>
      {/* Players Area - Outside GameHeader for consistency */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {players.map((player) => {
          const pState = state.playersState[player.id]
          if (!pState) return null

          return (
            <PlayerCard
              key={player.id}
              player={{
                ...player,
                isAlive:
                  player.isAlive &&
                  (pState.bankroll >= 25 ||
                    (pState.hands.length > 0 && pState.hands[0].bet > 0)),
              }}
              isMe={player.id === selfId}
              isAdmin={isAdmin}
              isActive={
                gameState === GameState.PLAYING &&
                (pState.bankroll >= 25 ||
                  (pState.hands.length > 0 && pState.hands[0].bet > 0)) &&
                (state.roundStatus === "betting" ||
                  state.activePlayerId === player.id)
              }
              isPlaying={gameState === GameState.PLAYING}
              onKick={onKick}
              onEditName={onEditName}
              showWins={false}
              showLives={false}
            >
              {(gameState === GameState.PLAYING ||
                gameState === GameState.ENDED) && (
                <div className="flex flex-col items-center gap-2">
                  {(() => {
                    const hasNoBet =
                      !pState.hands.length || pState.hands[0].bet === 0

                    if (pState.bankroll < 25 && hasNoBet) {
                      return (
                        <div className="flex flex-col items-center gap-1 py-4 opacity-50 text-red-500 font-bold uppercase tracking-widest text-sm">
                          Bankrupt
                        </div>
                      )
                    }

                    if (
                      state.roundStatus === "betting" &&
                      !pState.hands.length
                    ) {
                      return (
                        <div className="flex flex-col items-center gap-1 py-4 opacity-50">
                          <div className="loading loading-dots loading-sm"></div>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-yellow-500">
                            Betting...
                          </span>
                        </div>
                      )
                    }

                    return (
                      <div className="flex flex-wrap justify-center gap-2">
                        {pState.hands.map((hand, idx) => (
                          <HandComponent
                            key={idx}
                            hand={hand}
                            label={
                              pState.hands.length > 1 ? `Hand ${idx + 1}` : ""
                            }
                            isActive={
                              state.activePlayerId === player.id &&
                              pState.activeHandIndex === idx
                            }
                          />
                        ))}
                      </div>
                    )
                  })()}
                  <div className="flex items-center gap-2 mt-1">
                    {pState.hands.length > 0 && pState.hands[0].bet > 0 && (
                      <div className="text-sm font-bold text-yellow-500/80 bg-yellow-500/5 px-2 py-0.5 rounded-lg border border-yellow-500/10">
                        Bet: ${pState.hands.reduce((sum, h) => sum + h.bet, 0)}
                      </div>
                    )}
                    <div className="text-sm font-bold text-green-500/80 bg-green-500/5 px-2 py-0.5 rounded-lg border border-green-500/10">
                      Bank: ${pState.bankroll}
                    </div>
                  </div>
                </div>
              )}
            </PlayerCard>
          )
        })}
      </div>
      {/* Countdown overlay */}
      {state.countdown !== null && (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-[100]">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-9xl font-black text-white mb-8"
          >
            {state.countdown}
          </motion.div>
          {isAdmin && (
            <button
              onClick={() =>
                handleAction(BlackjackClientMessageType.START_GAME)
              }
              className="px-6 py-2 bg-white/20 hover:bg-white/30 text-white font-bold rounded-lg transition-colors border border-white/30"
            >
              Skip
            </button>
          )}
        </div>
      )}
    </div>
  )
}
