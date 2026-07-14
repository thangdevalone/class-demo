import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to all requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('class-demo-token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth API
export const authAPI = {
  login: (data: any) => api.post('/auth/login', data),

  me: () => api.get('/auth/me'),

  getUsers: () => api.get('/auth/users'),

  register: (data: any) => api.post('/auth/register', data),
  signup: (data: any) => api.post('/auth/signup', data),

  updateUser: (id: string, data: any) => api.put(`/auth/users/${id}`, data),

  deleteUser: (id: string) => api.delete(`/auth/users/${id}`),
};

// Classroom API
export const classroomAPI = {
  publicBrowse: () => api.get('/classrooms/public/browse'),
  list: () => api.get('/classrooms'),

  browse: () => api.get('/classrooms/browse'),

  get: (id: string) => api.get(`/classrooms/${id}`),

  create: (data: {
    name: string;
    description?: string;
    cameras?: { name: string; url: string; description?: string }[];
    teacherId?: string;
    studentIds?: string[];
    startTime: string;
    endTime: string;
  }) => api.post('/classrooms', data),

  update: (id: string, data: any) => api.put(`/classrooms/${id}`, data),

  delete: (id: string) => api.delete(`/classrooms/${id}`),

  register: (classroomId: string) =>
    api.post(`/classrooms/${classroomId}/register`),

  unregister: (classroomId: string) =>
    api.post(`/classrooms/${classroomId}/unregister`),

  raiseHand: (classroomId: string) =>
    api.post(`/classrooms/${classroomId}/raise-hand`),

  cancelHand: (classroomId: string) =>
    api.post(`/classrooms/${classroomId}/cancel-hand`),

  acceptHand: (classroomId: string, studentId: string, dmChannelCid?: string) =>
    api.post(`/classrooms/${classroomId}/accept-hand/${studentId}`, { dmChannelCid }),

  rejectHand: (classroomId: string, studentId: string) =>
    api.post(`/classrooms/${classroomId}/reject-hand/${studentId}`),

  completeHand: (classroomId: string, studentId: string) =>
    api.post(`/classrooms/${classroomId}/complete-hand/${studentId}`),

  getHands: (classroomId: string) =>
    api.get(`/classrooms/${classroomId}/hands`),

  getMyHand: (classroomId: string) =>
    api.get(`/classrooms/${classroomId}/my-hand`),
};

export default api;
