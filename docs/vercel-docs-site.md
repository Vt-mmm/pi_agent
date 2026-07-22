# Vercel docs site

## Khuyến nghị

Giữ tài liệu HTML trong cùng repository, dưới `docs-site/`.

Production URL hiện tại: https://docs-site-three-pearl.vercel.app

Lý do:

- Docs đi cùng version của package.
- Review source và docs trong cùng pull request.
- Vercel có thể trỏ Root Directory thẳng vào `docs-site`.
- Không cần build step vì site là static HTML.

Tách repository chỉ nên dùng khi docs cần domain, quyền truy cập, lịch phát hành, hoặc nhóm nội dung riêng với source Pi agent.

## Deploy bằng Dashboard

1. Vào Vercel, chọn Add New Project.
2. Chọn Git repository của Pi Company Platform.
3. Set Root Directory: `docs-site`.
4. Set Framework Preset: `Other`.
5. Build Command: để trống.
6. Output Directory: `.` hoặc để default.
7. Deploy production.

## Deploy bằng CLI

```bash
cd docs-site
vercel --prod
```

Nếu CLI chưa đăng nhập:

```bash
vercel login
```

Sau khi site đã nối Git, các lần sau chỉ cần sửa `docs-site/index.html`, commit và push vào production branch.

## Local preview

```bash
cd docs-site
python3 -m http.server 4173
```

Mở `http://localhost:4173`.

## Security notes

- Không đặt secret, token, auth file hoặc session cache trong `docs-site/`.
- File `docs-site/vercel.json` chỉ đặt static headers và URL behavior.
- Không cần biến môi trường cho site tĩnh này.
