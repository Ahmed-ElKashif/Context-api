const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

async function test() {
  const form = new FormData();
  form.append('files', Buffer.from('dummy pdf'), { filename: 'test.pdf', contentType: 'application/pdf' });
  form.append('clientPaths', '/test.pdf');
  
  let token;
  try {
    const regRes = await axios.post('http://localhost:5000/api/auth/register', {
      firstName: 'Test',
      lastName: 'User',
      email: 'test' + Date.now() + '@example.com',
      password: 'Password123!',
      passwordConfirm: 'Password123!'
    });
    token = regRes.data.token;
  } catch (e) {
    console.error('REGISTER ERROR:', e.response?.data);
    return;
  }

  try {
    const res = await axios.post('http://localhost:5000/api/documents/upload', form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` }
    });
    console.log(res.data);
  } catch (err) {
    console.error('UPLOAD ERROR:', err.response ? err.response.data : err.message);
  }
}
test();
