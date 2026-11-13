// All server calls live here (RTK Query). Components just call hooks like useGetCoursesQuery().
// "tags" tell RTK Query which cached data to refetch after a change (e.g. after enrolling, refetch the course).
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { logout } from './authSlice';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: '/api',
  prepareHeaders: (headers, { getState }) => {
    const token = getState().auth.token;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return headers;
  },
});

// If we SENT a login token and the server answers 401, that token is expired or no longer valid
// (for example the database was reset). Log out so the user can simply sign in again.
const baseQuery = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  if (result.error?.status === 401 && api.getState().auth.token) api.dispatch(logout());
  return result;
};

export const api = createApi({
  baseQuery,
  tagTypes: ['Course', 'Mine', 'Enrollments', 'Quizzes', 'Live', 'Certs', 'Lesson', 'Admin'],
  endpoints: (b) => ({
    login: b.mutation({ query: (body) => ({ url: '/auth/login', method: 'POST', body }) }),
    register: b.mutation({ query: (body) => ({ url: '/auth/register', method: 'POST', body }) }),

    getCourses: b.query({ query: (p) => ({ url: '/courses', params: p }), providesTags: ['Course'] }),
    getCourse: b.query({ query: (id) => `/courses/${id}`, providesTags: (r, e, id) => [{ type: 'Course', id }] }),
    myCourses: b.query({ query: () => '/courses/mine', providesTags: ['Mine'] }),
    createCourse: b.mutation({ query: (body) => ({ url: '/courses', method: 'POST', body }), invalidatesTags: ['Mine'] }),
    updateCourse: b.mutation({ query: ({ id, ...body }) => ({ url: `/courses/${id}`, method: 'PUT', body }), invalidatesTags: ['Course', 'Mine'] }),
    publishCourse: b.mutation({ query: ({ id, published }) => ({ url: `/courses/${id}/publish`, method: 'PATCH', body: { published } }), invalidatesTags: ['Course', 'Mine', 'Admin'] }),
    deleteCourse: b.mutation({ query: (id) => ({ url: `/courses/${id}`, method: 'DELETE' }), invalidatesTags: ['Course', 'Mine'] }),

    getLesson: b.query({ query: (id) => `/lessons/${id}`, providesTags: (r, e, id) => [{ type: 'Lesson', id }] }),
    createLesson: b.mutation({ query: ({ courseId, ...body }) => ({ url: `/courses/${courseId}/lessons`, method: 'POST', body }), invalidatesTags: ['Course'] }),
    updateLesson: b.mutation({ query: ({ id, ...body }) => ({ url: `/lessons/${id}`, method: 'PUT', body }), invalidatesTags: ['Course', 'Lesson'] }),
    deleteLesson: b.mutation({ query: (id) => ({ url: `/lessons/${id}`, method: 'DELETE' }), invalidatesTags: ['Course'] }),
    completeLesson: b.mutation({ query: (id) => ({ url: `/lessons/${id}/complete`, method: 'POST' }), invalidatesTags: ['Course', 'Enrollments', 'Certs'] }),

    enrollFree: b.mutation({ query: (id) => ({ url: `/courses/${id}/enroll`, method: 'POST' }), invalidatesTags: ['Course', 'Enrollments'] }),
    myEnrollments: b.query({ query: () => '/enrollments/me', providesTags: ['Enrollments'] }),

    getQuizzes: b.query({ query: (courseId) => `/courses/${courseId}/quizzes`, providesTags: ['Quizzes'] }),
    createQuiz: b.mutation({ query: ({ courseId, ...body }) => ({ url: `/courses/${courseId}/quizzes`, method: 'POST', body }), invalidatesTags: ['Quizzes', 'Course'] }),
    deleteQuiz: b.mutation({ query: (id) => ({ url: `/quizzes/${id}`, method: 'DELETE' }), invalidatesTags: ['Quizzes', 'Course'] }),
    attemptQuiz: b.mutation({ query: ({ id, answers }) => ({ url: `/quizzes/${id}/attempt`, method: 'POST', body: { answers } }), invalidatesTags: ['Quizzes', 'Course', 'Enrollments', 'Certs'] }),

    checkout: b.mutation({ query: (courseId) => ({ url: '/payments/checkout', method: 'POST', body: { courseId } }) }),
    confirmPayment: b.mutation({ query: (sessionId) => ({ url: '/payments/confirm', method: 'POST', body: { sessionId } }), invalidatesTags: ['Course', 'Enrollments'] }),
    mockSession: b.query({ query: (id) => `/payments/mock/${id}` }),
    mockPay: b.mutation({ query: (body) => ({ url: '/payments/mock/pay', method: 'POST', body }), invalidatesTags: ['Course', 'Enrollments'] }),
    earnings: b.query({ query: () => '/instructor/earnings' }),

    myCerts: b.query({ query: () => '/certificates/me', providesTags: ['Certs'] }),
    verifyCert: b.query({ query: (id) => `/certificates/verify/${id}` }),

    getLive: b.query({ query: (courseId) => `/courses/${courseId}/live`, providesTags: ['Live'] }),
    createLive: b.mutation({ query: ({ courseId, ...body }) => ({ url: `/courses/${courseId}/live`, method: 'POST', body }), invalidatesTags: ['Live'] }),
    startLive: b.mutation({ query: (id) => ({ url: `/live/${id}/start`, method: 'POST' }), invalidatesTags: ['Live'] }),
    endLive: b.mutation({ query: (id) => ({ url: `/live/${id}/end`, method: 'POST' }), invalidatesTags: ['Live'] }),
    liveToken: b.mutation({ query: (id) => ({ url: `/live/${id}/token`, method: 'POST' }) }),

    adminStats: b.query({ query: () => '/admin/stats', providesTags: ['Admin'] }),
    adminUsers: b.query({ query: () => '/admin/users', providesTags: ['Admin'] }),
    adminCourses: b.query({ query: () => '/admin/courses', providesTags: ['Admin'] }),
    setRole: b.mutation({ query: ({ id, role }) => ({ url: `/admin/users/${id}/role`, method: 'PATCH', body: { role } }), invalidatesTags: ['Admin'] }),
  }),
});

export const {
  useLoginMutation, useRegisterMutation, useGetCoursesQuery, useGetCourseQuery, useMyCoursesQuery, useCreateCourseMutation,
  useUpdateCourseMutation, usePublishCourseMutation, useDeleteCourseMutation, useGetLessonQuery, useCreateLessonMutation,
  useUpdateLessonMutation, useDeleteLessonMutation, useCompleteLessonMutation, useEnrollFreeMutation, useMyEnrollmentsQuery,
  useGetQuizzesQuery, useCreateQuizMutation, useDeleteQuizMutation, useAttemptQuizMutation, useCheckoutMutation,
  useConfirmPaymentMutation, useMockSessionQuery, useMockPayMutation, useEarningsQuery, useMyCertsQuery, useVerifyCertQuery, useGetLiveQuery, useCreateLiveMutation,
  useStartLiveMutation, useEndLiveMutation, useLiveTokenMutation, useAdminStatsQuery, useAdminUsersQuery,
  useAdminCoursesQuery, useSetRoleMutation,
} = api;

// ---- helpers ----
export const errMsg = (e) => e?.data?.errors?.map((x) => `${x.field}: ${x.message}`).join(', ') || e?.data?.message || e?.message || 'Something went wrong';
export const money = (cents) => (cents ? `$${(cents / 100).toFixed(2)}` : 'Free');
export const moneyZero = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;
export const mins = (s) => (s ? `${Math.max(1, Math.round(s / 60))} min` : '');

// Video upload uses XMLHttpRequest because fetch cannot report upload progress.
export function uploadVideo(lessonId, file, token, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/lessons/${lessonId}/video`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      xhr.status < 300 ? resolve(body) : reject(new Error(body.message || 'Upload failed'));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    const form = new FormData();
    form.append('video', file);
    xhr.send(form);
  });
}

// The certificate endpoint needs the login header, so we fetch it as a file and trigger the download ourselves.
export async function downloadCertificate(certificateId, token) {
  const res = await fetch(`/api/certificates/${certificateId}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Could not download the certificate');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = `certificate-${certificateId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
