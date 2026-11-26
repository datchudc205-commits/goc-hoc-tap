// Mục lục SGK lớp 6 – bộ "Kết nối tri thức với cuộc sống" (NXB Giáo dục Việt Nam).
// Nguồn đối chiếu: mục lục trên vietjack.com và loigiaihay.com (11/2026).
// Mỗi môn: { subject, chapters: [{ name, lessons: [...] }] }. Môn không có danh sách bài để chapters rỗng.

export const BOOK = 'Kết nối tri thức với cuộc sống';

const range = (from, titles) => titles.map((t, i) => `Bài ${from + i}. ${t}`);

export const GRADE6 = [
  {
    subject: 'Toán',
    chapters: [
      { name: 'Chương I. Tập hợp các số tự nhiên', lessons: [
        ...range(1, ['Tập hợp', 'Cách ghi số tự nhiên', 'Thứ tự trong tập hợp các số tự nhiên', 'Phép cộng và phép trừ số tự nhiên', 'Phép nhân và phép chia số tự nhiên']),
        'Luyện tập chung (trang 21)',
        ...range(6, ['Lũy thừa với số mũ tự nhiên', 'Thứ tự thực hiện các phép tính']),
        'Luyện tập chung (trang 27)', 'Bài tập cuối chương I'] },
      { name: 'Chương II. Tính chia hết trong tập hợp các số tự nhiên', lessons: [
        ...range(8, ['Quan hệ chia hết và tính chất', 'Dấu hiệu chia hết', 'Số nguyên tố']),
        'Luyện tập chung (trang 43)',
        ...range(11, ['Ước chung. Ước chung lớn nhất', 'Bội chung. Bội chung nhỏ nhất']),
        'Luyện tập chung (trang 54)', 'Bài tập cuối chương II'] },
      { name: 'Chương III. Số nguyên', lessons: [
        ...range(13, ['Tập hợp các số nguyên', 'Phép cộng và phép trừ số nguyên', 'Quy tắc dấu ngoặc']),
        'Luyện tập chung (trang 69)',
        ...range(16, ['Phép nhân số nguyên', 'Phép chia hết. Ước và bội của một số nguyên']),
        'Luyện tập chung (trang 75)', 'Bài tập cuối chương III'] },
      { name: 'Chương IV. Một số hình phẳng trong thực tiễn', lessons: [
        ...range(18, ['Hình tam giác đều. Hình vuông. Hình lục giác đều', 'Hình chữ nhật. Hình thoi. Hình bình hành. Hình thang cân', 'Chu vi và diện tích của một số tứ giác đã học']),
        'Luyện tập chung (trang 95)', 'Bài tập cuối chương IV'] },
      { name: 'Chương V. Tính đối xứng của hình phẳng trong tự nhiên', lessons: [
        ...range(21, ['Hình có trục đối xứng', 'Hình có tâm đối xứng']),
        'Luyện tập chung (trang 108)', 'Bài tập cuối chương V'] },
      { name: 'Chương VI. Phân số', lessons: [
        ...range(23, ['Mở rộng phân số. Phân số bằng nhau', 'So sánh phân số. Hỗn số dương']),
        'Luyện tập chung (trang 13)',
        ...range(25, ['Phép cộng và phép trừ phân số', 'Phép nhân và phép chia phân số', 'Hai bài toán về phân số']),
        'Luyện tập chung (trang 25)', 'Bài tập cuối chương VI'] },
      { name: 'Chương VII. Số thập phân', lessons: [
        ...range(28, ['Số thập phân', 'Tính toán với số thập phân', 'Làm tròn và ước lượng', 'Một số bài toán về tỉ số và tỉ số phần trăm']),
        'Luyện tập chung (trang 41)', 'Bài tập cuối chương VII'] },
      { name: 'Chương VIII. Những hình hình học cơ bản', lessons: [
        ...range(32, ['Điểm và đường thẳng', 'Điểm nằm giữa hai điểm. Tia', 'Đoạn thẳng. Độ dài đoạn thẳng', 'Trung điểm của đoạn thẳng']),
        'Luyện tập chung (trang 57)',
        ...range(36, ['Góc', 'Số đo góc']),
        'Luyện tập chung (trang 65)', 'Bài tập cuối chương VIII'] },
      { name: 'Chương IX. Dữ liệu và xác suất thực nghiệm', lessons: [
        ...range(38, ['Dữ liệu và thu thập dữ liệu', 'Bảng thống kê và biểu đồ tranh', 'Biểu đồ cột', 'Biểu đồ cột kép']),
        'Luyện tập chung (trang 87)',
        ...range(42, ['Kết quả có thể và sự kiện trong trò chơi, thí nghiệm', 'Xác suất thực nghiệm']),
        'Luyện tập chung (trang 97)', 'Bài tập cuối chương IX', 'Bài tập ôn tập cuối năm'] },
    ],
  },
  {
    subject: 'Ngữ văn',
    chapters: [
      { name: 'Bài 1. Tôi và các bạn', lessons: ['Bài học đường đời đầu tiên', 'Nếu cậu muốn có một người bạn…', 'Bắt nạt', 'Thực hành tiếng Việt', 'Viết bài văn kể lại một trải nghiệm của em', 'Nói và nghe: Kể lại một trải nghiệm của em'] },
      { name: 'Bài 2. Gõ cửa trái tim', lessons: ['Chuyện cổ tích về loài người', 'Mây và sóng', 'Bức tranh của em gái tôi', 'Thực hành tiếng Việt', 'Viết đoạn văn ghi lại cảm xúc về một bài thơ', 'Nói và nghe: Trình bày ý kiến về một vấn đề trong gia đình'] },
      { name: 'Bài 3. Yêu thương và chia sẻ', lessons: ['Cô bé bán diêm', 'Gió lạnh đầu mùa', 'Con chào mào', 'Thực hành tiếng Việt', 'Viết bài văn kể lại một trải nghiệm của em', 'Nói và nghe: Kể về một trải nghiệm của em'] },
      { name: 'Bài 4. Quê hương yêu dấu', lessons: ['Chùm ca dao về quê hương, đất nước', 'Chuyện cổ nước mình', 'Cây tre Việt Nam', 'Thực hành tiếng Việt', 'Tập làm một bài thơ lục bát', 'Nói và nghe: Trình bày suy nghĩ về tình cảm của con người với quê hương'] },
      { name: 'Bài 5. Những nẻo đường xứ sở', lessons: ['Cô Tô', 'Hang Én', 'Cửu Long Giang ta ơi', 'Thực hành tiếng Việt', 'Viết bài văn tả cảnh sinh hoạt', 'Nói và nghe: Chia sẻ trải nghiệm về nơi em sống', 'Ôn tập học kì I'] },
      { name: 'Bài 6. Chuyện kể về những người anh hùng', lessons: ['Thánh Gióng', 'Sơn Tinh, Thủy Tinh', 'Ai ơi mồng chín tháng tư', 'Thực hành tiếng Việt', 'Viết bài văn thuyết minh thuật lại một sự kiện', 'Nói và nghe: Kể lại một truyền thuyết'] },
      { name: 'Bài 7. Thế giới cổ tích', lessons: ['Thạch Sanh', 'Cây khế', 'Vua chích chòe', 'Thực hành tiếng Việt', 'Viết: Đóng vai nhân vật kể lại một truyện cổ tích', 'Nói và nghe: Kể lại một truyện cổ tích bằng lời của nhân vật'] },
      { name: 'Bài 8. Khác biệt và gần gũi', lessons: ['Xem người ta kìa!', 'Hai loại khác biệt', 'Bài tập làm văn', 'Thực hành tiếng Việt', 'Viết bài văn trình bày ý kiến về một hiện tượng đời sống', 'Nói và nghe: Trình bày ý kiến về một hiện tượng đời sống'] },
      { name: 'Bài 9. Trái Đất – ngôi nhà chung', lessons: ['Trái Đất – cái nôi của sự sống', 'Các loài chung sống với nhau như thế nào?', 'Trái Đất (thơ)', 'Thực hành tiếng Việt', 'Viết biên bản một cuộc họp, cuộc thảo luận', 'Nói và nghe: Thảo luận giải pháp khắc phục nạn ô nhiễm môi trường'] },
      { name: 'Bài 10. Cuốn sách tôi yêu', lessons: ['Thách thức đầu tiên: Mỗi ngày một cuốn sách', 'Thách thức thứ hai: Sáng tạo cùng tác giả', 'Về đích: Ngày hội với sách', 'Ôn tập học kì II'] },
    ],
  },
  {
    subject: 'Tiếng Anh',
    chapters: [
      ['Unit 1. My new school', 'Unit 2. My house', 'Unit 3. My friends', 'Review 1 (Unit 1–3)'],
      ['Unit 4. My neighbourhood', 'Unit 5. Natural wonders of Viet Nam', 'Unit 6. Our Tet holiday', 'Review 2 (Unit 4–6)'],
      ['Unit 7. Television', 'Unit 8. Sports and games', 'Unit 9. Cities of the world', 'Review 3 (Unit 7–9)'],
      ['Unit 10. Our houses in the future', 'Unit 11. Our greener world', 'Unit 12. Robots', 'Review 4 (Unit 10–12)'],
    ].flat().map((u) => ({
      name: u,
      lessons: u.startsWith('Review') ? ['Language', 'Skills']
        : ['Getting Started', 'A Closer Look 1', 'A Closer Look 2', 'Communication', 'Skills 1', 'Skills 2', 'Looking Back', 'Project'],
    })),
  },
  {
    subject: 'Khoa học tự nhiên',
    chapters: [
      { name: 'Chương I. Mở đầu về Khoa học tự nhiên', lessons: range(1, ['Giới thiệu về Khoa học tự nhiên', 'An toàn trong phòng thực hành', 'Sử dụng kính lúp', 'Sử dụng kính hiển vi quang học', 'Đo chiều dài', 'Đo khối lượng', 'Đo thời gian', 'Đo nhiệt độ']) },
      { name: 'Chương II. Chất quanh ta', lessons: range(9, ['Sự đa dạng của chất', 'Các thể của chất và sự chuyển thể', 'Oxygen. Không khí']) },
      { name: 'Chương III. Một số vật liệu, nguyên liệu, nhiên liệu, lương thực – thực phẩm thông dụng', lessons: range(12, ['Một số vật liệu', 'Một số nguyên liệu', 'Một số nhiên liệu', 'Một số lương thực, thực phẩm']) },
      { name: 'Chương IV. Hỗn hợp. Tách chất ra khỏi hỗn hợp', lessons: range(16, ['Hỗn hợp các chất', 'Tách các chất khỏi hỗn hợp']) },
      { name: 'Chương V. Tế bào', lessons: range(18, ['Tế bào – đơn vị cơ bản của sự sống', 'Cấu tạo và chức năng các thành phần của tế bào', 'Sự lớn lên và sinh sản của tế bào', 'Thực hành: Quan sát và phân biệt một số loại tế bào']) },
      { name: 'Chương VI. Từ tế bào đến cơ thể', lessons: range(22, ['Cơ thể sinh vật', 'Tổ chức cơ thể đa bào', 'Thực hành: Quan sát và mô tả cơ thể đơn bào, cơ thể đa bào']) },
      { name: 'Chương VII. Đa dạng thế giới sống', lessons: range(25, ['Hệ thống phân loại sinh vật', 'Khóa lưỡng phân', 'Vi khuẩn', 'Thực hành: Làm sữa chua và quan sát vi khuẩn', 'Virus', 'Nguyên sinh vật', 'Thực hành: Quan sát nguyên sinh vật', 'Nấm', 'Thực hành: Quan sát các loại nấm', 'Thực vật', 'Thực hành: Quan sát và phân biệt một số nhóm thực vật', 'Động vật', 'Thực hành: Quan sát và nhận biết một số nhóm động vật ngoài thiên nhiên', 'Đa dạng sinh học', 'Tìm hiểu sinh vật ngoài thiên nhiên']) },
      { name: 'Chương VIII. Lực trong đời sống', lessons: range(40, ['Lực là gì?', 'Biểu diễn lực', 'Biến dạng của lò xo', 'Trọng lượng, lực hấp dẫn', 'Lực ma sát', 'Lực cản của nước']) },
      { name: 'Chương IX. Năng lượng', lessons: range(46, ['Năng lượng và sự truyền năng lượng', 'Một số dạng năng lượng', 'Sự chuyển hóa năng lượng', 'Năng lượng hao phí', 'Năng lượng tái tạo', 'Tiết kiệm năng lượng']) },
      { name: 'Chương X. Trái Đất và bầu trời', lessons: range(52, ['Chuyển động nhìn thấy của Mặt Trời. Thiên thể', 'Mặt Trăng', 'Hệ Mặt Trời', 'Ngân Hà']) },
    ],
  },
  {
    subject: 'Lịch sử và Địa lí',
    chapters: [
      { name: 'Lịch sử – Chương 1. Vì sao phải học lịch sử?', lessons: range(1, ['Lịch sử và cuộc sống', 'Dựa vào đâu để biết và phục dựng lại lịch sử?', 'Thời gian trong lịch sử']) },
      { name: 'Lịch sử – Chương 2. Xã hội nguyên thủy', lessons: range(4, ['Nguồn gốc loài người', 'Xã hội nguyên thủy', 'Sự biến chuyển và phân hóa của xã hội nguyên thủy']) },
      { name: 'Lịch sử – Chương 3. Xã hội cổ đại', lessons: range(7, ['Ai Cập và Lưỡng Hà cổ đại', 'Ấn Độ cổ đại', 'Trung Quốc cổ đại', 'Hy Lạp và La Mã cổ đại']) },
      { name: 'Lịch sử – Chương 4. Đông Nam Á từ những thế kỉ tiếp giáp đầu Công nguyên đến thế kỉ X', lessons: range(11, ['Các quốc gia sơ kì ở Đông Nam Á', 'Sự hình thành và bước đầu phát triển của các vương quốc phong kiến ở Đông Nam Á (từ thế kỉ VII đến thế kỉ X)', 'Giao lưu văn hóa ở Đông Nam Á từ đầu Công nguyên đến thế kỉ X']) },
      { name: 'Lịch sử – Chương 5. Việt Nam từ khoảng thế kỉ VII trước Công nguyên đến đầu thế kỉ X', lessons: range(14, ['Nhà nước Văn Lang, Âu Lạc', 'Chính sách cai trị của các triều đại phong kiến phương Bắc và sự chuyển biến của xã hội Âu Lạc', 'Các cuộc khởi nghĩa tiêu biểu giành độc lập trước thế kỉ X', 'Cuộc đấu tranh bảo tồn và phát triển văn hóa dân tộc của người Việt', 'Bước ngoặt lịch sử đầu thế kỉ X', 'Vương quốc Chăm-pa từ thế kỉ II đến thế kỉ X', 'Vương quốc Phù Nam']) },
      { name: 'Địa lí – Bài mở đầu', lessons: ['Bài mở đầu'] },
      { name: 'Địa lí – Chương 1. Bản đồ – Phương tiện thể hiện bề mặt Trái Đất', lessons: range(1, ['Hệ thống kinh, vĩ tuyến. Tọa độ địa lí', 'Bản đồ. Một số lưới kinh, vĩ tuyến. Phương hướng trên bản đồ', 'Tỉ lệ bản đồ. Tính khoảng cách thực tế dựa vào tỉ lệ bản đồ', 'Kí hiệu và bảng chú giải bản đồ. Tìm đường đi trên bản đồ', 'Lược đồ trí nhớ']) },
      { name: 'Địa lí – Chương 2. Trái Đất – hành tinh của hệ Mặt Trời', lessons: range(6, ['Trái Đất trong hệ Mặt Trời', 'Chuyển động tự quay quanh trục của Trái Đất và hệ quả', 'Chuyển động của Trái Đất quanh Mặt Trời và hệ quả', 'Xác định phương hướng ngoài thực địa']) },
      { name: 'Địa lí – Chương 3. Cấu tạo của Trái Đất. Vỏ Trái Đất', lessons: range(10, ['Cấu tạo của Trái Đất. Các mảng kiến tạo', 'Quá trình nội sinh và quá trình ngoại sinh. Hiện tượng tạo núi', 'Núi lửa và động đất', 'Các dạng địa hình chính trên Trái Đất. Khoáng sản', 'Thực hành: Đọc lược đồ địa hình tỉ lệ lớn và lát cắt địa hình đơn giản']) },
      { name: 'Địa lí – Chương 4. Khí hậu và biến đổi khí hậu', lessons: range(15, ['Lớp vỏ khí của Trái Đất. Khí áp và gió', 'Nhiệt độ không khí. Mây và mưa', 'Thời tiết và khí hậu. Biến đổi khí hậu', 'Thực hành: Phân tích biểu đồ nhiệt độ, lượng mưa']) },
      { name: 'Địa lí – Chương 5. Nước trên Trái Đất', lessons: range(19, ['Thủy quyển và vòng tuần hoàn lớn của nước', 'Sông và hồ. Nước ngầm và băng hà', 'Biển và đại dương']) },
      { name: 'Địa lí – Chương 6. Đất và sinh vật trên Trái Đất', lessons: range(22, ['Lớp đất trên Trái Đất', 'Sự sống trên Trái Đất', 'Rừng nhiệt đới', 'Sự phân bố các đới thiên nhiên trên Trái Đất', 'Thực hành: Tìm hiểu môi trường tự nhiên địa phương']) },
      { name: 'Địa lí – Chương 7. Con người và thiên nhiên', lessons: range(27, ['Dân số và sự phân bố dân cư trên thế giới', 'Mối quan hệ giữa con người và thiên nhiên', 'Bảo vệ tự nhiên và khai thác thông minh các tài nguyên thiên nhiên vì sự phát triển bền vững', 'Thực hành: Tìm hiểu mối quan hệ giữa con người và thiên nhiên ở địa phương']) },
    ],
  },
  {
    subject: 'Giáo dục công dân',
    chapters: [{ name: 'Cả năm', lessons: range(1, ['Tự hào về truyền thống gia đình, dòng họ', 'Yêu thương con người', 'Siêng năng, kiên trì', 'Tôn trọng sự thật', 'Tự lập', 'Tự nhận thức bản thân', 'Ứng phó với tình huống nguy hiểm', 'Tiết kiệm', 'Công dân nước Cộng hòa xã hội chủ nghĩa Việt Nam', 'Quyền và nghĩa vụ cơ bản của công dân', 'Quyền cơ bản của trẻ em', 'Thực hiện quyền trẻ em']) }],
  },
  {
    subject: 'Tin học',
    chapters: [
      { name: 'Chủ đề 1. Máy tính và cộng đồng', lessons: range(1, ['Thông tin và dữ liệu', 'Xử lí thông tin', 'Thông tin trong máy tính']) },
      { name: 'Chủ đề 2. Mạng máy tính và Internet', lessons: range(4, ['Mạng máy tính', 'Internet']) },
      { name: 'Chủ đề 3. Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin', lessons: range(6, ['Mạng thông tin toàn cầu', 'Tìm kiếm thông tin trên Internet', 'Thư điện tử']) },
      { name: 'Chủ đề 4. Đạo đức, pháp luật và văn hóa trong môi trường số', lessons: range(9, ['An toàn thông tin trên Internet']) },
      { name: 'Chủ đề 5. Ứng dụng tin học', lessons: range(10, ['Sơ đồ tư duy', 'Định dạng văn bản', 'Trình bày thông tin ở dạng bảng', 'Thực hành: Tìm kiếm và thay thế', 'Thực hành tổng hợp: Hoàn thiện sổ lưu niệm']) },
      { name: 'Chủ đề 6. Giải quyết vấn đề với sự trợ giúp của máy tính', lessons: range(15, ['Thuật toán', 'Cấu trúc điều khiển', 'Chương trình máy tính']) },
    ],
  },
  {
    subject: 'Công nghệ',
    chapters: [
      { name: 'Chương I. Nhà ở', lessons: [...range(1, ['Khái quát về nhà ở', 'Xây dựng nhà ở', 'Ngôi nhà thông minh']), 'Ôn tập chương I'] },
      { name: 'Chương II. Bảo quản và chế biến thực phẩm', lessons: [...range(4, ['Thực phẩm và dinh dưỡng', 'Phương pháp bảo quản và chế biến thực phẩm', 'Dự án: Bữa ăn kết nối yêu thương']), 'Ôn tập chương II'] },
      { name: 'Chương III. Trang phục và thời trang', lessons: [...range(7, ['Trang phục trong đời sống', 'Sử dụng và bảo quản trang phục', 'Thời trang']), 'Ôn tập chương III'] },
      { name: 'Chương IV. Đồ dùng điện trong gia đình', lessons: [...range(10, ['Khái quát về đồ dùng điện trong gia đình', 'Đèn điện', 'Nồi cơm điện', 'Bếp hồng ngoại', 'Dự án: An toàn và tiết kiệm trong gia đình']), 'Ôn tập chương IV'] },
    ],
  },
  { subject: 'Âm nhạc', chapters: [] },
  { subject: 'Mĩ thuật', chapters: [] },
  { subject: 'Giáo dục thể chất', chapters: [] },
  { subject: 'Hoạt động trải nghiệm, hướng nghiệp', chapters: [] },
];

export const SUBJECTS_6 = GRADE6.map((s) => s.subject);
export const findSubject = (name) => GRADE6.find((s) => s.subject === name);
