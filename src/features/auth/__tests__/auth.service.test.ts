import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { AuthService } from '../auth.service'
import { User } from '../../users/user.model'

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('bcryptjs')
jest.mock('jsonwebtoken')
jest.mock('../../users/user.model', () => ({
  User: {
    findOne: jest.fn(),
    create: jest.fn()
  }
}))

beforeEach(() => {
  jest.clearAllMocks()
  process.env.JWT_SECRET = 'testsecret'
})

// ─────────────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  describe('generateToken()', () => {
    it('signs and returns a JWT token', () => {
      ;(jwt.sign as jest.Mock).mockReturnValue('mocked.jwt.token')

      const token = AuthService.generateToken('user123')

      expect(jwt.sign).toHaveBeenCalledWith(
        { id: 'user123' },
        'testsecret',
        expect.objectContaining({ expiresIn: expect.any(String) })
      )
      expect(token).toBe('mocked.jwt.token')
    })
  })

  describe('registerUser()', () => {
    it('returns error if email already exists', async () => {
      ;(User.findOne as jest.Mock).mockResolvedValueOnce({ email: 'test@test.com' })

      const result = await AuthService.registerUser({ email: 'test@test.com', username: 'newuser' })

      expect(result.error?.message).toBe('User with this email already exists')
      expect(result.error?.statusCode).toBe(400)
    })

    it('returns error if username already exists', async () => {
      ;(User.findOne as jest.Mock).mockResolvedValueOnce({ username: 'existinguser' })

      const result = await AuthService.registerUser({
        email: 'new@test.com',
        username: 'existinguser'
      })

      expect(result.error?.message).toBe('This username is already taken')
      expect(result.error?.statusCode).toBe(400)
    })

    it('hashes password and creates new user successfully', async () => {
      ;(User.findOne as jest.Mock).mockResolvedValueOnce(null)
      ;(bcrypt.genSalt as jest.Mock).mockResolvedValueOnce('salt')
      ;(bcrypt.hash as jest.Mock).mockResolvedValueOnce('hashedpassword')
      ;(User.create as jest.Mock).mockResolvedValueOnce({ id: 'u1', username: 'newuser' })
      ;(jwt.sign as jest.Mock).mockReturnValue('mock.token')

      const result = await AuthService.registerUser({
        fullName: 'Test User',
        username: 'newuser',
        email: 'test@test.com',
        passwordHash: 'plainpassword',
        persona: 'student'
      })

      expect(bcrypt.genSalt).toHaveBeenCalledWith(10)
      expect(bcrypt.hash).toHaveBeenCalledWith('plainpassword', 'salt')
      expect(User.create).toHaveBeenCalledWith({
        fullName: 'Test User',
        username: 'newuser',
        email: 'test@test.com',
        passwordHash: 'hashedpassword',
        persona: 'student'
      })
      expect(result.user?.username).toBe('newuser')
      expect(result.token).toBe('mock.token')
    })
  })

  describe('loginUser()', () => {
    it('returns error if user not found by email', async () => {
      ;(User.findOne as jest.Mock).mockResolvedValueOnce(null)

      const result = await AuthService.loginUser('wrong@test.com', 'password')

      expect(result.error?.message).toBe('Invalid email or password')
      expect(result.error?.statusCode).toBe(401)
    })

    it('returns error if password does not match', async () => {
      ;(User.findOne as jest.Mock).mockResolvedValueOnce({ passwordHash: 'hash' })
      ;(bcrypt.compare as jest.Mock).mockResolvedValueOnce(false)

      const result = await AuthService.loginUser('test@test.com', 'wrongpassword')

      expect(result.error?.message).toBe('Invalid email or password')
      expect(result.error?.statusCode).toBe(401)
    })

    it('returns user and token on successful login', async () => {
      ;(User.findOne as jest.Mock).mockResolvedValueOnce({ id: 'u1', username: 'u1', passwordHash: 'hash' })
      ;(bcrypt.compare as jest.Mock).mockResolvedValueOnce(true)
      ;(jwt.sign as jest.Mock).mockReturnValue('mock.token')

      const result = await AuthService.loginUser('test@test.com', 'correctpassword')

      expect(result.user?.username).toBe('u1')
      expect(result.token).toBe('mock.token')
    })
  })
})
