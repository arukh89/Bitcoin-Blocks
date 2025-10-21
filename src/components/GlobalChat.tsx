'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { useGame } from '../context/GameContext'
import { useToast } from '../hooks/use-toast'
import type { ChatMessage } from '../types/game'

interface GlobalChatProps {}

export function GlobalChat({}: GlobalChatProps): React.ReactElement {
  const { user, activeRound, chatMessages, addChatMessage } = useGame()
  const { toast } = useToast()
  const [message, setMessage] = useState<string>('')
  const [sending, setSending] = useState<boolean>(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = (): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [chatMessages])

  // GLOBAL CHAT: Show all messages from all rounds (not filtered by active round)
  // This ensures chat is always visible and active even without a round
  // NOTE: Guesses are NOT shown in chat - they only appear in the GuessForm component
  const allMessages = [...chatMessages]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 100)

  return (
    <Card className="glass-card-dark border-cyan-500/30 h-full flex flex-col shadow-3d">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-white text-lg">
          <motion.span
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            💬
          </motion.span>
          Live Chat
          <Badge variant="outline" className="ml-auto bg-cyan-500/20 text-cyan-300 border-cyan-400/50 text-xs">
            {allMessages.length} messages
          </Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="flex-1 overflow-hidden flex flex-col">
        {/* Chat Input - Always visible when user logged in */}
        {user && (
          <div className="mb-4">
            <form onSubmit={async (e) => {
              e.preventDefault()
              
              if (!message.trim()) return
              
              if (message.length > 200) {
                toast({
                  title: '⚠️ Message Too Long',
                  description: 'Maximum 200 characters allowed',
                  variant: 'destructive'
                })
                return
              }
              
              try {
                setSending(true)
                const chatMsg: ChatMessage = {
                  id: `chat-${Date.now()}-${user.address}`,
                  roundId: activeRound?.id || 'global',
                  address: user.address,
                  username: user.username,
                  message: message.trim(),
                  pfpUrl: user.pfpUrl,
                  timestamp: Date.now(),
                  type: 'chat'
                }
                addChatMessage(chatMsg)
                setMessage('')
                toast({
                  title: '✅ Message Sent',
                  description: 'Your message is now visible to all players'
                })
              } catch (error) {
                toast({
                  title: '❌ Send Failed',
                  description: 'Could not send message',
                  variant: 'destructive'
                })
              } finally {
                setSending(false)
              }
            }} className="flex gap-2">
              <Input
                type="text"
                placeholder="Type a message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={sending}
                maxLength={200}
                className="h-10 text-sm bg-gray-800/50 border-cyan-500/50 text-white placeholder:text-gray-500"
              />
              <Button 
                type="submit" 
                disabled={!message.trim() || sending}
                className="h-10 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold text-sm"
              >
                {sending ? '⚙️' : '📤'}
              </Button>
            </form>
          </div>
        )}

        {/* Messages Container - ALWAYS VISIBLE */}
        <div className="flex-1 overflow-hidden">
        {allMessages.length === 0 ? (
          <motion.div
            className="flex flex-col items-center justify-center h-full"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <p className="text-4xl mb-4">💬</p>
            <p className="text-gray-400 text-base font-medium">Global Chat Active</p>
            <p className="text-gray-500 text-xs mt-2">{activeRound ? 'Send a message to get started!' : 'Chat is open - round will start soon'}</p>
          </motion.div>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-cyan-600 scrollbar-track-gray-800">
            <AnimatePresence mode="popLayout">
              {allMessages.map((msg, index) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: -30, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 30, scale: 0.9 }}
                  transition={{ delay: index * 0.05 }}
                  className={`flex items-start gap-3 p-3 rounded-xl backdrop-blur-xl border ${
                    msg.type === 'winner'
                      ? 'glass-card border-yellow-500/50 bg-gradient-to-r from-yellow-500/20 to-orange-500/20'
                      : msg.type === 'system'
                      ? 'glass-card border-purple-400/50 bg-purple-500/10'
                      : msg.type === 'guess'
                      ? 'glass-card border-orange-500/50 bg-gradient-to-r from-orange-500/10 to-purple-500/10'
                      : msg.type === 'chat'
                      ? 'glass-card border-cyan-500/30 bg-cyan-500/5'
                      : 'glass-card-dark border-gray-500/30'
                  }`}
                >
                  <Avatar className="h-10 w-10 ring-2 ring-cyan-400/50">
                    <AvatarImage src={msg.pfpUrl} alt={msg.username} />
                    <AvatarFallback className="bg-gradient-to-br from-cyan-500 to-blue-500 text-white text-xs">
                      {msg.username[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`font-bold text-sm ${
                        msg.type === 'winner' ? 'text-yellow-300' : 'text-white'
                      }`}>
                        @{msg.username}
                      </span>
                      <span className="text-[10px] text-gray-500 font-mono">
                        {msg.address.slice(0, 6)}...{msg.address.slice(-4)}
                      </span>
                      {msg.type === 'winner' && (
                        <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-400/50 text-xs">
                          👑 Winner
                        </Badge>
                      )}
                      {msg.type === 'guess' && (
                        <Badge className="bg-orange-500/20 text-orange-300 border-orange-400/50 text-xs">
                          🎯 Guess
                        </Badge>
                      )}
                    </div>
                    <p className={`text-sm ${
                      msg.type === 'winner' 
                        ? 'text-yellow-200 font-semibold' 
                        : msg.type === 'system'
                        ? 'text-purple-200'
                        : msg.type === 'guess'
                        ? 'text-orange-200 font-semibold'
                        : 'text-gray-300'
                    }`}>
                      {msg.message}
                    </p>
                    <span className="text-[10px] text-gray-500 mt-1 block">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>
        )}
        </div>
      </CardContent>

    </Card>
  )
}
